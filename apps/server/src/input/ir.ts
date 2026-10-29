import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { DisplayCommand } from '@officeboard/shared';

/** Linux input-event-codes.h key codes mapped to board commands. */
const KEYMAP: Record<number, DisplayCommand> = {
  103: { type: 'up' }, // KEY_UP
  108: { type: 'down' }, // KEY_DOWN
  105: { type: 'prev' }, // KEY_LEFT
  106: { type: 'next' }, // KEY_RIGHT
  28: { type: 'select' }, // KEY_ENTER
  352: { type: 'select' }, // KEY_OK
  96: { type: 'select' }, // KEY_KPENTER
  1: { type: 'back' }, // KEY_ESC
  158: { type: 'back' }, // KEY_BACK
  174: { type: 'back' }, // KEY_EXIT
  102: { type: 'home' }, // KEY_HOME
  172: { type: 'home' }, // KEY_HOMEPAGE
  139: { type: 'info' }, // KEY_MENU
  358: { type: 'info' }, // KEY_INFO
  164: { type: 'pause' }, // KEY_PLAYPAUSE
  119: { type: 'pause' }, // KEY_PAUSE
  207: { type: 'pause' }, // KEY_PLAY
  57: { type: 'pause' }, // KEY_SPACE
  407: { type: 'next' }, // KEY_NEXT
  163: { type: 'next' }, // KEY_NEXTSONG
  208: { type: 'next' }, // KEY_FASTFORWARD
  412: { type: 'prev' }, // KEY_PREVIOUS
  165: { type: 'prev' }, // KEY_PREVIOUSSONG
  168: { type: 'prev' }, // KEY_REWIND
  25: { type: 'pin' }, // KEY_P
  398: { type: 'pin' }, // KEY_RED
  128: { type: 'pin' }, // KEY_STOP
};
// KEY_1..KEY_9 are codes 2..10; KEY_NUMERIC_1..9 are 0x201..0x209.
for (let n = 1; n <= 9; n++) {
  KEYMAP[1 + n] = { type: 'goto', index: n };
  KEYMAP[0x200 + n] = { type: 'goto', index: n };
}

const EV_KEY = 1;
// struct input_event: struct timeval (two longs) + u16 type + u16 code + s32 value.
const EVENT_SIZE = process.arch === 'arm' || process.arch === 'ia32' ? 16 : 24;
const TIME_BYTES = EVENT_SIZE - 8;
const REPEATABLE = new Set(['up', 'down']);
const RETRY_MS = 30_000;

export interface AdapterStatus {
  enabled: boolean;
  running: boolean;
  detail: string | null;
  error: string | null;
  lastInput: string | null;
}

/** Finds the first input device whose name looks like an IR receiver. */
function detectIrDevice(): string | null {
  let text: string;
  try {
    text = fs.readFileSync('/proc/bus/input/devices', 'utf8');
  } catch {
    return null;
  }
  for (const block of text.split(/\n\n+/)) {
    const name = /N: Name="([^"]*)"/.exec(block)?.[1] ?? '';
    if (!/ir|lirc|rc-|remote/i.test(name)) continue;
    const handler = /H: Handlers=.*\b(event\d+)\b/.exec(block)?.[1];
    if (handler) return `/dev/input/${handler}`;
  }
  return null;
}

/**
 * Reads key events from an IR receiver exposed through the kernel's rc-core (gpio-ir + ir-keytable).
 * No native modules: we parse raw input_event structs from the device file.
 */
export class IrAdapter extends EventEmitter<{ command: [DisplayCommand] }> {
  private stream: fs.ReadStream | null = null;
  private retry: NodeJS.Timeout | null = null;
  private buffer = Buffer.alloc(0);
  private enabled = false;
  private devicePath = '';
  private lastEmit = 0;
  status: AdapterStatus = { enabled: false, running: false, detail: null, error: null, lastInput: null };

  configure(enabled: boolean, devicePath: string): void {
    if (enabled === this.enabled && devicePath === this.devicePath && (this.stream || !enabled)) return;
    this.enabled = enabled;
    this.devicePath = devicePath;
    this.stop();
    this.status = { ...this.status, enabled, error: null, detail: null };
    if (enabled) this.open();
  }

  private open(): void {
    if (process.platform !== 'linux') {
      this.status.error = 'IR input is only available on Linux (Raspberry Pi)';
      return;
    }
    const path = this.devicePath || detectIrDevice();
    if (!path) {
      this.status.error = 'No IR receiver found. Enable the gpio-ir overlay or set the device path.';
      this.scheduleRetry();
      return;
    }
    this.status.detail = path;
    const stream = fs.createReadStream(path, { highWaterMark: EVENT_SIZE * 64 });
    this.stream = stream;
    stream.on('open', () => {
      this.status.running = true;
      this.status.error = null;
    });
    stream.on('data', (chunk) => this.onData(chunk as Buffer));
    stream.on('error', (err) => {
      this.status.running = false;
      this.status.error = err.message;
      this.stream = null;
      this.scheduleRetry();
    });
    stream.on('close', () => {
      this.status.running = false;
      if (this.stream === stream) {
        this.stream = null;
        this.scheduleRetry();
      }
    });
  }

  private scheduleRetry(): void {
    if (!this.enabled || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.enabled && !this.stream) this.open();
    }, RETRY_MS);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= EVENT_SIZE) {
      const ev = this.buffer.subarray(0, EVENT_SIZE);
      this.buffer = this.buffer.subarray(EVENT_SIZE);
      const type = ev.readUInt16LE(TIME_BYTES);
      const code = ev.readUInt16LE(TIME_BYTES + 2);
      const value = ev.readInt32LE(TIME_BYTES + 4);
      if (type !== EV_KEY || value === 0) continue;
      const cmd = KEYMAP[code];
      this.status.lastInput = `key ${code}${cmd ? ` -> ${cmd.type}` : ' (unmapped)'}`;
      if (!cmd) continue;
      // value 2 = autorepeat; only scrolling should repeat.
      if (value === 2 && !REPEATABLE.has(cmd.type)) continue;
      const now = Date.now();
      if (now - this.lastEmit < 120) continue;
      this.lastEmit = now;
      this.emit('command', cmd);
    }
  }

  stop(): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const s = this.stream;
    this.stream = null;
    s?.destroy();
    this.buffer = Buffer.alloc(0);
    this.status.running = false;
  }
}
