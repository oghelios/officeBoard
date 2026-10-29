import { useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { WEEKDAY_SHORT } from '@officeboard/shared';
import { addDays, formatYmd, todayYmd, weekdayOf } from '../../lib/format';
import { itemsByDay, type DayItem } from '../calendarUtils';
import { SourceStatus } from '../components';
import { useDisplay, useNow, useScreenCommand, type ScreenProps } from '../context';

type View = 'agenda' | 'week' | 'month';
const VIEWS: View[] = ['agenda', 'week', 'month'];

function ItemLine({ item, compact }: { item: DayItem; compact?: boolean }) {
  return (
    <li className={`cal-item ${item.kind} ${item.allDay ? 'all-day' : ''}`} style={{ '--item-color': item.color } as React.CSSProperties}>
      {item.kind === 'reminder' ? <Bell size="0.85em" className="cal-bell" /> : <span className="event-dot" />}
      {!compact && !item.allDay && <span className="event-time">{item.timeLabel}</span>}
      {compact && !item.allDay && item.startMs !== null && (
        <span className="event-time">{item.timeLabel.replace(/:00(?= ?[AP]M)/, '').replace(' ', '')}</span>
      )}
      <span className="event-title">{item.title}</span>
    </li>
  );
}

function monthGrid(today: string, monthOffset: number) {
  const [y, m] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + monthOffset, 1)).toISOString().slice(0, 10);
  const start = addDays(first, -weekdayOf(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  // Drop a trailing week that's entirely in the next month.
  const month = first.slice(0, 7);
  const trimmed = days.slice(35).every((d) => d.slice(0, 7) !== month) ? days.slice(0, 35) : days;
  return { first, month, days: trimmed };
}

export function CalendarScreen({ screen, active }: ScreenProps) {
  const { settings, data } = useDisplay();
  const cfg = screen.config as { view: View; agendaDays: number; showReminders: boolean };
  const tz = settings.location.timezone;
  const hour24 = settings.clock24h;
  const now = useNow(60_000);
  const today = todayYmd(tz, now);

  const [view, setView] = useState<View>(cfg.view);
  const [offset, setOffset] = useState(0);
  useScreenCommand(active, (cmd) => {
    if (cmd === 'select') {
      setView((v) => VIEWS[(VIEWS.indexOf(v) + 1) % VIEWS.length]);
      setOffset(0);
    }
    if (cmd === 'down') setOffset((o) => Math.min(o + 1, 2));
    if (cmd === 'up') setOffset((o) => Math.max(o - 1, view === 'agenda' ? 0 : -1));
  });

  const calendar = data.calendar.data;
  const range = useMemo(() => {
    if (view === 'agenda') {
      const from = addDays(today, offset * cfg.agendaDays);
      return { from, to: addDays(from, cfg.agendaDays - 1) };
    }
    if (view === 'week') {
      const from = addDays(today, -weekdayOf(today) + offset * 7);
      return { from, to: addDays(from, 6) };
    }
    const g = monthGrid(today, offset);
    return { from: g.days[0], to: g.days[g.days.length - 1] };
  }, [view, offset, today, cfg.agendaDays]);

  const byDay = useMemo(
    () =>
      itemsByDay({
        events: calendar?.events ?? [],
        reminders: data.reminders.data?.reminders ?? [],
        includeReminders: cfg.showReminders,
        timeZone: tz,
        hour24,
        from: range.from,
        to: range.to,
      }),
    [calendar, data.reminders.data, cfg.showReminders, tz, hour24, range],
  );

  const title =
    view === 'month'
      ? formatYmd(monthGrid(today, offset).first, { month: 'long', year: 'numeric' })
      : `${formatYmd(range.from, { month: 'short', day: 'numeric' })} - ${formatYmd(range.to, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const notConnected = !calendar?.connected;

  return (
    <div className="screen calendar">
      <header className="screen-header">
        <h1>{title}</h1>
        <div className="screen-header-meta">
          {calendar?.calendars.map((c) => (
            <span key={c.id} className="cal-legend">
              <span className="event-dot" style={{ background: c.color }} />
              {c.name}
            </span>
          ))}
          <span className="view-tabs">
            {VIEWS.map((v) => (
              <span key={v} className={v === view ? 'on' : ''}>
                {v[0].toUpperCase() + v.slice(1)}
              </span>
            ))}
          </span>
        </div>
      </header>

      {notConnected && (
        <div className="notice">
          {data.calendar.error ? (
            <SourceStatus envelope={data.calendar} emptyText="" />
          ) : (
            'Google Calendar is not connected. Showing reminders only.'
          )}
        </div>
      )}

      {view === 'agenda' && <AgendaView byDay={byDay} from={range.from} to={range.to} today={today} />}
      {view === 'week' && <WeekView byDay={byDay} from={range.from} today={today} />}
      {view === 'month' && <MonthView byDay={byDay} today={today} offset={offset} />}
    </div>
  );
}

function AgendaView({ byDay, from, to, today }: { byDay: Map<string, DayItem[]>; from: string; to: string; today: string }) {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (byDay.has(d)) days.push(d);
  if (days.length === 0) {
    return <div className="center-message grow dim">Nothing scheduled in this period.</div>;
  }
  return (
    <div className="agenda">
      {days.map((d) => (
        <section key={d} className={`agenda-day ${d === today ? 'today' : ''}`}>
          <h3>
            {d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : formatYmd(d, { weekday: 'long' })}
            <span className="dim"> {formatYmd(d, { month: 'short', day: 'numeric' })}</span>
          </h3>
          <ul>
            {byDay.get(d)!.map((item) => (
              <ItemLine key={item.key} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function WeekView({ byDay, from, today }: { byDay: Map<string, DayItem[]>; from: string; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className="week">
      {days.map((d) => (
        <section key={d} className={`week-day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}`}>
          <h3>
            <span>{WEEKDAY_SHORT[weekdayOf(d)]}</span>
            <span className="week-date">{Number(d.slice(8, 10))}</span>
          </h3>
          <ul>
            {(byDay.get(d) ?? []).map((item) => (
              <ItemLine key={item.key} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MonthView({ byDay, today, offset }: { byDay: Map<string, DayItem[]>; today: string; offset: number }) {
  const { month, days } = monthGrid(today, offset);
  const MAX = days.length > 35 ? 2 : 3;
  return (
    <div className="month">
      {WEEKDAY_SHORT.map((w) => (
        <div key={w} className="month-head">
          {w}
        </div>
      ))}
      {days.map((d) => {
        const items = byDay.get(d) ?? [];
        return (
          <div
            key={d}
            className={`month-cell ${d === today ? 'today' : ''} ${d.slice(0, 7) !== month ? 'other' : ''}`}
          >
            <div className="month-date">{Number(d.slice(8, 10))}</div>
            <ul>
              {items.slice(0, MAX).map((item) => (
                <ItemLine key={item.key} item={item} compact />
              ))}
              {items.length > MAX && <li className="dim more">+{items.length - MAX} more</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
