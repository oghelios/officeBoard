import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';
import type { DisplayCommand } from '@officeboard/shared';
import type { AdapterStatus } from './ir.js';

/** HDMI-CEC "User Control Pressed" (opcode 0x44) operand codes. */
const UI_CODES: Record<number, DisplayCommand> = {
  0x00: { type: 'select' },
  0x01: { type: 'up' },
  0x02: { type: 'down' },
  0x03: { type: 'prev' }, // left
  0x04: { type: 'next' }, // right
  0x09: { type: 'home' }, // root menu
  0x0a: { type: 'info' }, // setup menu
  0x0b: { type: 'info' }, // contents menu
  0x0d: { type: 'back' }, // exit
  0x35: { type: 'info' }, // display information
  0x44: { type: 'pause' }, // play
  0x46: { type: 'pause' }, // pause
  0x61: { type: 'pause' }, // pause-play function
  0x45: { type: 'pin' }, // stop
  0x48: { type: 'prev' }, // rewind
  0x49: { type: 'next' }, // fast forward
  0x4b: { type: 'next' }, // forward
  0x4c: { type: 'prev' }, // backward
  0x72: { type: 'pin' }, // F2 (red)
  0x71: { type: 'info' }, // F1 (blue)
  0x73: { type: 'home' }, // F3 (green)
  0x74: { type: 'pause' }, // F4 (yellow)
};
for (let n = 1; n <= 9; n++) UI_CODES[0x20 + n] = { type: 'goto', index: n };

/** Matches received traffic lines such as "TRAFFIC: [ 1234]  >> 01:44:04". */
const KEY_PRESS = />>\s*[0-9a-f]{2}:44:([0-9a-f]{2})/i;
const RESTART_MS = 15_000;

/**
 * Wraps a long-running `cec-client` process: parses remote key presses from its traffic log and
 * sends power commands through its stdin.
 */
export class CecAdapter extends EventEmitter<{ command: [DisplayCommand] }> {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private restart: NodeJS.Timeout | null = null;
  private enabled = false;
  private command = 'cec-client';
  status: AdapterStatus = { enabled: false, running: false, detail: null, error: null, lastInput: null };

  configure(enabled: boolean, command: string): void {
    const cmd = command.trim() || 'cec-client';
    if (enabled === this.enabled && cmd === this.command && (this.proc || !enabled)) return;
    this.enabled = enabled;
    this.command = cmd;
    this.stop();
    this.status = { ...this.status, enabled, error: null, detail: cmd };
    if (enabled) this.launch();
  }

  private launch(): void {
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(this.command, ['-d', '8', '-t', 'p', '-o', 'OfficeBoard'], { stdio: 'pipe' });
    } catch (err) {
      this.status.error = (err as Error).message;
      this.scheduleRestart();
      return;
    }
    this.proc = proc;
    proc.stdin.on('error', () => undefined);
    proc.on('spawn', () => {
      this.status.running = true;
      this.status.error = null;
    });
    proc.on('error', (err) => {
      this.status.running = false;
      this.status.error =
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? `${this.command} not found. Install it with: sudo apt install cec-utils`
          : err.message;
      // A failed spawn emits 'error' without 'exit'.
      if (this.proc === proc && proc.exitCode === null && !proc.pid) {
        this.proc = null;
        this.scheduleRestart();
      }
    });
    proc.on('exit', (code) => {
      this.status.running = false;
      if (this.proc === proc) {
        this.proc = null;
        if (!this.status.error) this.status.error = `cec-client exited (code ${code})`;
        this.scheduleRestart();
      }
    });
    readline.createInterface({ input: proc.stdout }).on('line', (line) => this.onLine(line));
    proc.stderr.resume();
  }

  private onLine(line: string): void {
    const m = KEY_PRESS.exec(line);
    if (!m) return;
    const code = parseInt(m[1], 16);
    const cmd = UI_CODES[code];
    this.status.lastInput = `0x${m[1]}${cmd ? ` -> ${cmd.type}` : ' (unmapped)'}`;
    if (cmd) this.emit('command', cmd);
  }

  private scheduleRestart(): void {
    if (!this.enabled || this.restart) return;
    this.restart = setTimeout(() => {
      this.restart = null;
      if (this.enabled && !this.proc) this.launch();
    }, RESTART_MS);
  }

  /** Turns the TV (logical address 0) on or to standby. */
  async power(on: boolean): Promise<void> {
    const line = on ? 'on 0\n' : 'standby 0\n';
    if (this.proc && this.status.running) {
      this.proc.stdin.write(line);
      return;
    }
    // No persistent process: run a one-shot cec-client in single-command mode.
    await new Promise<void>((resolve, reject) => {
      const p = spawn(this.command, ['-s', '-d', '1'], { stdio: 'pipe' });
      p.stdin.on('error', () => undefined);
      const timer = setTimeout(() => {
        p.kill();
        reject(new Error('cec-client timed out'));
      }, 20_000);
      p.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      p.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      p.stdin.end(line);
    });
  }

  stop(): void {
    if (this.restart) clearTimeout(this.restart);
    this.restart = null;
    const p = this.proc;
    this.proc = null;
    if (p && p.pid && p.exitCode === null) {
      p.stdin.write('q\n');
      setTimeout(() => p.kill(), 2000).unref();
    }
    this.status.running = false;
  }
}
