export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday */
  weekday: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock components of `date` in `timeZone` (falls back to the host zone if invalid). */
export function zonedParts(date: Date, timeZone?: string): ZonedParts {
  const tz = timeZone && isValidTimeZone(timeZone) ? timeZone : undefined;
  const parts = partsFormatter(tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** True when `minutes` (since midnight) falls in [start, end), supporting overnight ranges. */
export function inTimeRange(minutes: number, start: string, end: string): boolean {
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (s === e) return false;
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}

/**
 * Like inTimeRange but for a weekly rule: for overnight ranges the day check applies to the
 * day the range started on.
 */
export function inWeeklyRange(
  parts: ZonedParts,
  days: number[],
  start: string,
  end: string,
): boolean {
  const minutes = parts.hour * 60 + parts.minute;
  if (!inTimeRange(minutes, start, end)) return false;
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  const overnightTail = s > e && minutes < e;
  const day = overnightTail ? (parts.weekday + 6) % 7 : parts.weekday;
  return days.includes(day);
}

/** YYYY-MM-DD for the given wall-clock parts. */
export function ymd(parts: Pick<ZonedParts, 'year' | 'month' | 'day'>): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = WEEKDAYS;
