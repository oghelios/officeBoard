import type { WebSocket } from 'ws';
import {
  displayCommandSchema,
  pickDisplaySettings,
  type DisplayConfig,
  type ServerMessage,
} from '@officeboard/shared';
import { webBuildId } from '../config.js';
import type { DataHub } from './data-hub.js';
import type { RotationEngine } from './rotation.js';
import type { ScreensService } from './screens.js';
import type { SettingsService } from './settings.js';

export type ClientRole = 'display' | 'admin';

interface Client {
  socket: WebSocket;
  role: ClientRole;
  alive: boolean;
}

export class DisplayHub {
  private clients = new Set<Client>();
  private seq = 0;
  private heartbeat: NodeJS.Timeout;
  private buildId = webBuildId();

  constructor(
    private screens: ScreensService,
    private settings: SettingsService,
    private rotation: RotationEngine,
    private data: DataHub,
  ) {
    rotation.on('change', (state) => this.broadcast({ type: 'rotation', rotation: state }));
    rotation.on('screenCommand', (command) =>
      this.broadcast({ type: 'screenCommand', command, seq: ++this.seq }),
    );
    rotation.on('osd', (text) => this.broadcast({ type: 'osd', text }));
    screens.on('change', () => this.broadcast({ type: 'config', config: this.config() }));
    settings.on('change', () => this.broadcast({ type: 'config', config: this.config() }));
    data.on('update', (source) =>
      this.broadcast({ type: 'data', source, envelope: data.get(source) }),
    );

    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.socket.terminate();
          this.clients.delete(c);
          continue;
        }
        c.alive = false;
        c.socket.ping();
      }
    }, 30_000);
  }

  config(): DisplayConfig {
    return { screens: this.screens.list(), settings: pickDisplaySettings(this.settings.get()) };
  }

  count(role?: ClientRole): number {
    let n = 0;
    for (const c of this.clients) if (!role || c.role === role) n++;
    return n;
  }

  attach(socket: WebSocket, role: ClientRole): void {
    const client: Client = { socket, role, alive: true };
    this.clients.add(client);
    socket.on('pong', () => (client.alive = true));
    socket.on('close', () => this.clients.delete(client));
    socket.on('error', () => this.clients.delete(client));
    socket.on('message', (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      const m = msg as { type?: string; command?: unknown };
      if (m.type === 'ping') {
        client.alive = true;
        return;
      }
      if (m.type === 'command') {
        const parsed = displayCommandSchema.safeParse(m.command);
        if (parsed.success) this.rotation.command(parsed.data, role);
      }
    });
    this.send(socket, {
      type: 'hello',
      buildId: this.buildId,
      config: this.config(),
      rotation: this.rotation.getState(),
      data: this.data.getState(),
    });
  }

  broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const c of this.clients) {
      if (c.socket.readyState === c.socket.OPEN) c.socket.send(payload);
    }
  }

  reloadDisplays(): void {
    this.broadcast({ type: 'reload' });
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const c of this.clients) c.socket.close();
  }

  private send(socket: WebSocket, msg: ServerMessage): void {
    socket.send(JSON.stringify(msg));
  }
}
