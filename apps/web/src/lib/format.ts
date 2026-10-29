import { zonedParts, ymd } from '@officeboard/shared';

export function formatTime(
  date: Date,
  opts: { timeZone?: string; hour24?: boolean; seconds?: boolean } = {},
): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: opts.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    ...(opts.seconds && { second: '2-digit' }),
    hourCycle: opts.hour24 ? 'h23' : 'h12',
  }).format(date);
}

/** "9:41" plus a separate "AM" so the display can style the suffix smaller. */
export function splitTime(date: Date, opts: { timeZone?: string; hour24?: boolean; seconds?: boolean }) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: opts.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    ...(opts.seconds && { second: '2-digit' }),
    hourCycle: opts.hour24 ? 'h23' : 'h12',
  }).formatToParts(date);
  const main = parts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim();
  const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
  return { main, period };
}

export function formatDate(date: Date, timeZone?: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...opts,
  }).format(date);
}

/** Today's YYYY-MM-DD in a time zone. */
export function todayYmd(timeZone?: string, now = new Date()): string {
  return ymd(zonedParts(now, timeZone));
}

/** Adds days to a YYYY-MM-DD string. */
export function addDays(dateYmd: string, days: number): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Day of week (0 = Sunday) for a YYYY-MM-DD string. */
export function weekdayOf(dateYmd: string): number {
  const [y, m, d] = dateYmd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Formats a YYYY-MM-DD as a label, without timezone shifting. */
export function formatYmd(dateYmd: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Formats an Open-Meteo local time string ("2026-10-29T14:00") without timezone conversion. */
export function formatLocalHour(local: string, hour24: boolean): string {
  const hour = Number(local.slice(11, 13));
  if (hour24) return `${String(hour).padStart(2, '0')}:00`;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function formatLocalClock(local: string | null, hour24: boolean): string {
  if (!local) return '--';
  const hour = Number(local.slice(11, 13));
  const minute = local.slice(14, 16);
  if (hour24) return `${String(hour).padStart(2, '0')}:${minute}`;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
}

export function formatDuration(totalSec: number): string {
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function tempUnit(units: 'imperial' | 'metric'): string {
  return units === 'imperial' ? '°F' : '°C';
}

export function speedUnit(units: 'imperial' | 'metric'): string {
  return units === 'imperial' ? 'mph' : 'km/h';
}
