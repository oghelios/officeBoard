import { EventEmitter } from 'node:events';
import {
  SCREEN_LOCAL_COMMANDS,
  inWeeklyRange,
  zonedParts,
  type CommandSource,
  type DisplayCommand,
  type RotationState,
  type ScheduleRule,
  type ScreenInstance,
  type SimpleCommand,
} from '@officeboard/shared';
import type { ScreensService } from './screens.js';
import type { SettingsService } from './settings.js';

/** Identical commands from different inputs inside this window are treated as one key press. */
const DEDUPE_MS = 250;

interface RotationEvents {
  change: [state: RotationState];
  screenCommand: [command: SimpleCommand];
  osd: [text: string];
}

export class RotationEngine extends EventEmitter<RotationEvents> {
  private currentId: string | null = null;
  private startedAt = Date.now();
  /** Manual navigation temporarily overrides an active schedule until this time. */
  private manualUntil = 0;
  private scheduleId: string | null = null;
  private lastPinned: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastEmitted = '';
  private lastCommand: { key: string; source: CommandSource; at: number } | null = null;

  constructor(
    private screens: ScreensService,
    private settings: SettingsService,
  ) {
    super();
    screens.on('change', () => this.tick());
    settings.on('change', () => this.tick());
  }

  start(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  getState(): RotationState {
    const s = this.settings.get().rotation;
    const current = this.currentId ? this.screens.get(this.currentId) : null;
    const isStatic = Boolean(s.pinnedScreenId) || Boolean(this.scheduleId) || s.paused;
    return {
      currentScreenId: this.currentId,
      pinnedScreenId: s.pinnedScreenId,
      paused: s.paused,
      scheduleId: this.scheduleId,
      startedAt: this.startedAt,
      durationMs: isStatic || !current ? null : current.durationSec * 1000,
      serverTime: Date.now(),
    };
  }

  private enabled(): ScreenInstance[] {
    return this.screens.list().filter((s) => s.enabled);
  }

  private activeSchedule(all: ScreenInstance[]): ScheduleRule | null {
    const settings = this.settings.get();
    const parts = zonedParts(new Date(), settings.location.timezone);
    return (
      settings.schedules.find(
        (r) =>
          r.enabled &&
          all.some((s) => s.id === r.screenId) &&
          inWeeklyRange(parts, r.days, r.start, r.end),
      ) ?? null
    );
  }

  private show(id: string | null): void {
    this.currentId = id;
    this.startedAt = Date.now();
  }

  tick(): void {
    const now = Date.now();
    const all = this.screens.list();
    const enabled = all.filter((s) => s.enabled);
    const rotation = this.settings.get().rotation;
    const pinned = rotation.pinnedScreenId && all.some((s) => s.id === rotation.pinnedScreenId)
      ? rotation.pinnedScreenId
      : null;
    // Unpinning hands control straight back to schedules, discarding any earlier manual override.
    if (this.lastPinned && !pinned) this.manualUntil = 0;
    this.lastPinned = pinned;

    if (pinned) {
      this.scheduleId = null;
      if (this.currentId !== pinned) this.show(pinned);
    } else {
      const schedule = now >= this.manualUntil ? this.activeSchedule(all) : null;
      if (schedule) {
        this.scheduleId = schedule.id;
        if (this.currentId !== schedule.screenId) this.show(schedule.screenId);
      } else {
        this.scheduleId = null;
        const current = enabled.find((s) => s.id === this.currentId);
        if (!current) {
          this.show(enabled[0]?.id ?? null);
        } else if (!rotation.paused && now - this.startedAt >= current.durationSec * 1000) {
          const idx = enabled.indexOf(current);
          this.show(enabled[(idx + 1) % enabled.length].id);
        }
      }
    }
    this.emitIfChanged();
  }

  private emitIfChanged(): void {
    const state = this.getState();
    const { serverTime: _ignored, ...comparable } = state;
    const key = JSON.stringify(comparable);
    if (key !== this.lastEmitted) {
      this.lastEmitted = key;
      this.emit('change', state);
    }
  }

  private navigateTo(target: ScreenInstance | undefined): void {
    if (!target) return;
    const rotation = this.settings.get().rotation;
    this.manualUntil = Date.now() + target.durationSec * 1000;
    this.show(target.id);
    if (rotation.pinnedScreenId && rotation.pinnedScreenId !== target.id) {
      // Navigating while pinned keeps the board static, just on the new screen.
      this.settings.update({ rotation: { pinnedScreenId: target.id } });
    }
    this.tick();
    this.emit('osd', target.name);
  }

  command(cmd: DisplayCommand, source: CommandSource): void {
    const now = Date.now();
    const key = JSON.stringify(cmd);
    const last = this.lastCommand;
    if (last && last.key === key && last.source !== source && now - last.at < DEDUPE_MS) return;
    this.lastCommand = { key, source, at: now };

    if (cmd.type === 'goto') {
      const all = this.screens.list();
      const target = cmd.screenId
        ? all.find((s) => s.id === cmd.screenId)
        : cmd.index
          ? this.enabled()[cmd.index - 1]
          : undefined;
      this.navigateTo(target);
      return;
    }

    if (SCREEN_LOCAL_COMMANDS.includes(cmd.type)) {
      this.emit('screenCommand', cmd.type);
      return;
    }

    const enabled = this.enabled();
    const rotation = this.settings.get().rotation;
    switch (cmd.type) {
      case 'next':
      case 'prev': {
        if (enabled.length === 0) return;
        const idx = enabled.findIndex((s) => s.id === this.currentId);
        const step = cmd.type === 'next' ? 1 : -1;
        const nextIdx = idx === -1 ? 0 : (idx + step + enabled.length) % enabled.length;
        this.navigateTo(enabled[nextIdx]);
        return;
      }
      case 'home':
      case 'back':
        this.navigateTo(enabled.find((s) => s.type === 'home') ?? enabled[0]);
        return;
      case 'pause': {
        const paused = !rotation.paused;
        this.startedAt = Date.now();
        this.settings.update({ rotation: { paused } });
        this.emit('osd', paused ? 'Rotation paused' : 'Rotation resumed');
        return;
      }
      case 'pin': {
        if (rotation.pinnedScreenId) {
          this.startedAt = Date.now();
          this.settings.update({ rotation: { pinnedScreenId: null } });
          this.emit('osd', 'Unpinned');
        } else if (this.currentId) {
          this.settings.update({ rotation: { pinnedScreenId: this.currentId } });
          this.emit('osd', `Pinned: ${this.screens.get(this.currentId)?.name ?? ''}`);
        }
        return;
      }
      case 'info': {
        const name = this.currentId ? this.screens.get(this.currentId)?.name : 'No screen';
        const mode = rotation.pinnedScreenId
          ? 'pinned'
          : this.scheduleId
            ? 'scheduled'
            : rotation.paused
              ? 'paused'
              : 'rotating';
        this.emit('osd', `${name} - ${mode}`);
        return;
      }
    }
  }
}
