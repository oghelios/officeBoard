import fs from 'node:fs';
import os from 'node:os';
import si from 'systeminformation';
import type { SystemData } from '@officeboard/shared';
import { fetchWithTimeout } from '../lib/http.js';

const INTERNET_CHECK_URL = 'https://www.gstatic.com/generate_204';
const INTERNET_CHECK_MS = 60_000;

function readPiModel(): string | null {
  try {
    return fs.readFileSync('/proc/device-tree/model', 'utf8').replace(/\0/g, '').trim() || null;
  } catch {
    return null;
  }
}

export class SystemMonitor {
  private internet: SystemData['internet'] = { online: false, latencyMs: null, checkedAt: null };
  private internetTimer: NodeJS.Timeout | null = null;
  private model = readPiModel();
  private startedAt = Date.now();

  constructor(private displayClients: () => number) {}

  start(): void {
    void this.checkInternet();
    this.internetTimer = setInterval(() => void this.checkInternet(), INTERNET_CHECK_MS);
  }

  stop(): void {
    if (this.internetTimer) clearInterval(this.internetTimer);
  }

  async checkInternet(): Promise<void> {
    const t0 = Date.now();
    try {
      const res = await fetchWithTimeout(INTERNET_CHECK_URL, { method: 'GET', timeoutMs: 5000 });
      this.internet = {
        online: res.status < 500,
        latencyMs: Date.now() - t0,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      this.internet = { online: false, latencyMs: null, checkedAt: new Date().toISOString() };
    }
  }

  async collect(): Promise<SystemData> {
    const [load, temp, mem, disks] = await Promise.all([
      si.currentLoad().catch(() => null),
      si.cpuTemperature().catch(() => null),
      si.mem().catch(() => null),
      si.fsSize().catch(() => []),
    ]);

    const root =
      disks.find((d) => d.mount === '/') ??
      disks.find((d) => /^[A-Z]:$/i.test(d.mount)) ??
      disks[0] ??
      null;

    const addresses = Object.entries(os.networkInterfaces()).flatMap(([iface, list]) =>
      (list ?? [])
        .filter((a) => a.family === 'IPv4' && !a.internal)
        .map((a) => ({ iface, address: a.address })),
    );

    const cpuTemp = temp?.main;
    return {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      model: this.model,
      cpuLoad: Math.round(load?.currentLoad ?? 0),
      cpuTemp: typeof cpuTemp === 'number' && cpuTemp > 0 ? Math.round(cpuTemp * 10) / 10 : null,
      memUsed: mem ? mem.active : os.totalmem() - os.freemem(),
      memTotal: mem?.total ?? os.totalmem(),
      disk: root ? { mount: root.mount, used: root.used, size: root.size } : null,
      uptimeSec: Math.round(os.uptime()),
      serverUptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      addresses,
      internet: this.internet,
      nodeVersion: process.version,
      displayClients: this.displayClients(),
    };
  }
}
