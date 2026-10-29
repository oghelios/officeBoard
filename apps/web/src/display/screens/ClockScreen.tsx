import { ymd, zonedParts } from '@officeboard/shared';
import { formatDate, splitTime } from '../../lib/format';
import { useDisplay, useNow, type ScreenProps } from '../context';

/** Offset of `tz` relative to the board's zone, in hours (e.g. +5, -3.5). */
function relativeOffsetHours(now: Date, tz: string, baseTz: string): number {
  const toMinutes = (p: ReturnType<typeof zonedParts>) =>
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) / 60000;
  return (toMinutes(zonedParts(now, tz)) - toMinutes(zonedParts(now, baseTz))) / 60;
}

export function ClockScreen({ screen }: ScreenProps) {
  const { settings } = useDisplay();
  const cfg = screen.config as { showSeconds: boolean; showWorldClocks: boolean };
  const tz = settings.location.timezone;
  const now = useNow(1000);
  const time = splitTime(now, { timeZone: tz, hour24: settings.clock24h, seconds: cfg.showSeconds });
  const today = ymd(zonedParts(now, tz));
  const clocks = cfg.showWorldClocks ? settings.worldClocks : [];

  return (
    <div className="screen clock">
      <div className="clock-main">
        <div className="clock-time">
          {time.main}
          {time.period && <span className="period">{time.period}</span>}
        </div>
        <div className="clock-date">{formatDate(now, tz, { year: 'numeric' })}</div>
        <div className="clock-location dim">{settings.location.name}</div>
      </div>
      {clocks.length > 0 && (
        <div className="world-clocks" style={{ gridTemplateColumns: `repeat(${Math.min(clocks.length, 5)}, 1fr)` }}>
          {clocks.map((c) => {
            let label = '';
            let t = { main: '--:--', period: '' };
            try {
              t = splitTime(now, { timeZone: c.timezone, hour24: settings.clock24h });
              const day = ymd(zonedParts(now, c.timezone));
              const diff = relativeOffsetHours(now, c.timezone, tz);
              const dayLabel = day > today ? 'Tomorrow' : day < today ? 'Yesterday' : 'Today';
              label = `${dayLabel}, ${diff === 0 ? 'same time' : `${diff > 0 ? '+' : ''}${diff}h`}`;
            } catch {
              label = 'Invalid time zone';
            }
            return (
              <div key={`${c.label}-${c.timezone}`} className="world-clock">
                <div className="world-label">{c.label}</div>
                <div className="world-time">
                  {t.main}
                  {t.period && <span className="period">{t.period}</span>}
                </div>
                <div className="dim small">{label}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
