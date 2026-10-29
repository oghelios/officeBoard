import { inWeeklyRange, zonedParts } from '@officeboard/shared';
import { errorMessage } from '../lib/http.js';
import type { RotationEngine } from '../services/rotation.js';
import type { SettingsService } from '../services/settings.js';
import { CecAdapter } from './cec.js';
import { IrAdapter } from './ir.js';

export interface TvPowerStatus {
  enabled: boolean;
  desired: 'on' | 'off' | null;
  lastAction: string | null;
  lastError: string | null;
}

/** Owns the optional hardware input adapters and the CEC TV power schedule. */
export class InputManager {
  readonly ir = new IrAdapter();
  readonly cec = new CecAdapter();
  private powerTimer: NodeJS.Timeout | null = null;
  private lastDesired: boolean | null = null;
  tvPower: TvPowerStatus = { enabled: false, desired: null, lastAction: null, lastError: null };

  constructor(
    private settings: SettingsService,
    rotation: RotationEngine,
  ) {
    this.ir.on('command', (cmd) => rotation.command(cmd, 'ir'));
    this.cec.on('command', (cmd) => rotation.command(cmd, 'cec'));
    settings.on('change', (next, prev) => {
      this.applyConfig();
      if (JSON.stringify(next.tvPower) !== JSON.stringify(prev.tvPower)) {
        this.lastDesired = null;
        this.checkPower();
      }
    });
  }

  start(): void {
    this.applyConfig();
    this.checkPower();
    this.powerTimer = setInterval(() => this.checkPower(), 30_000);
  }

  stop(): void {
    if (this.powerTimer) clearInterval(this.powerTimer);
    this.ir.stop();
    this.cec.stop();
  }

  private applyConfig(): void {
    const { input } = this.settings.get();
    this.ir.configure(input.ir.enabled, input.ir.devicePath);
    this.cec.configure(input.cec.enabled, input.cec.command);
  }

  async setTvPower(on: boolean): Promise<void> {
    try {
      await this.cec.power(on);
      this.tvPower.lastAction = `${on ? 'On' : 'Standby'} at ${new Date().toLocaleString()}`;
      this.tvPower.lastError = null;
    } catch (err) {
      this.tvPower.lastError = errorMessage(err);
      throw err;
    }
  }

  /**
   * Acts only on transitions so a manual power change isn't immediately undone. At startup the TV
   * is turned on if we're inside the on-window, but never forced off.
   */
  private checkPower(): void {
    const s = this.settings.get();
    this.tvPower.enabled = s.tvPower.enabled;
    if (!s.tvPower.enabled) {
      this.tvPower.desired = null;
      this.lastDesired = null;
      return;
    }
    const parts = zonedParts(new Date(), s.location.timezone);
    const desired = inWeeklyRange(parts, s.tvPower.days, s.tvPower.onTime, s.tvPower.offTime);
    this.tvPower.desired = desired ? 'on' : 'off';
    const first = this.lastDesired === null;
    if (desired === this.lastDesired) return;
    this.lastDesired = desired;
    if (first && !desired) return;
    this.setTvPower(desired).catch(() => undefined);
  }

  status() {
    return { ir: this.ir.status, cec: this.cec.status, tvPower: this.tvPower };
  }
}
