import { ymd, zonedParts, type CalendarEvent, type Reminder } from '@officeboard/shared';
import { addDays, formatTime } from '../lib/format';

export interface DayItem {
  key: string;
  kind: 'event' | 'reminder';
  title: string;
  allDay: boolean;
  /** Sort key and "has it ended" check; null for all-day items. */
  startMs: number | null;
  endMs: number | null;
  timeLabel: string;
  color: string;
  location: string | null;
}

const REMINDER_COLOR = 'var(--warn)';
const MAX_SPAN_DAYS = 62;

function push(map: Map<string, DayItem[]>, day: string, item: DayItem) {
  const list = map.get(day);
  if (list) list.push(item);
  else map.set(day, [item]);
}

/** Buckets events and reminders into local days (YYYY-MM-DD) within [from, to]. */
export function itemsByDay(opts: {
  events: CalendarEvent[];
  reminders: Reminder[];
  timeZone: string;
  hour24: boolean;
  from: string;
  to: string;
  includeReminders?: boolean;
}): Map<string, DayItem[]> {
  const { events, reminders, timeZone, hour24, from, to } = opts;
  const map = new Map<string, DayItem[]>();
  const inRange = (d: string) => d >= from && d <= to;
  const localDay = (ms: number) => ymd(zonedParts(new Date(ms), timeZone));

  for (const e of events) {
    if (e.allDay) {
      const end = e.end && e.end > e.start ? e.end : addDays(e.start, 1);
      let d = e.start < from ? from : e.start;
      for (let i = 0; d < end && d <= to && i < MAX_SPAN_DAYS; i++, d = addDays(d, 1)) {
        push(map, d, {
          key: `${e.id}@${d}`,
          kind: 'event',
          title: e.title,
          allDay: true,
          startMs: null,
          endMs: null,
          timeLabel: 'All day',
          color: e.color,
          location: e.location,
        });
      }
      continue;
    }
    const startMs = new Date(e.start).getTime();
    const endMs = e.end ? new Date(e.end).getTime() : startMs;
    if (Number.isNaN(startMs)) continue;
    const firstDay = localDay(startMs);
    const lastDay = localDay(Math.max(startMs, endMs - 1));
    let d = firstDay;
    for (let i = 0; d <= lastDay && i < MAX_SPAN_DAYS; i++, d = addDays(d, 1)) {
      if (!inRange(d)) continue;
      push(map, d, {
        key: `${e.id}@${d}`,
        kind: 'event',
        title: e.title,
        allDay: false,
        startMs: d === firstDay ? startMs : null,
        endMs,
        timeLabel: d === firstDay ? formatTime(new Date(startMs), { timeZone, hour24 }) : 'Continues',
        color: e.color,
        location: e.location,
      });
    }
  }

  if (opts.includeReminders !== false) {
    for (const r of reminders) {
      if (r.done || !r.dueAt) continue;
      const day = r.allDay ? r.dueAt.slice(0, 10) : localDay(new Date(r.dueAt).getTime());
      if (!inRange(day)) continue;
      const ms = r.allDay ? null : new Date(r.dueAt).getTime();
      push(map, day, {
        key: `reminder-${r.id}`,
        kind: 'reminder',
        title: r.title,
        allDay: r.allDay,
        startMs: ms,
        endMs: ms,
        timeLabel: r.allDay ? 'Reminder' : formatTime(new Date(ms!), { timeZone, hour24 }),
        color: REMINDER_COLOR,
        location: null,
      });
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return (a.startMs ?? 0) - (b.startMs ?? 0);
    });
  }
  return map;
}
