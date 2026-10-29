import { useMemo } from 'react';
import { Bell, CalendarDays, Droplets, Newspaper, Wind } from 'lucide-react';
import { describeWeather, ymd, zonedParts, type Reminder } from '@officeboard/shared';
import {
  formatDate,
  formatTime,
  formatYmd,
  speedUnit,
  splitTime,
  tempUnit,
  timeAgo,
} from '../../lib/format';
import { itemsByDay } from '../calendarUtils';
import { Panel, SourceStatus, WeatherIcon } from '../components';
import { useCycler, useDisplay, useNow, type ScreenProps } from '../context';

function reminderWhen(r: Reminder, timeZone: string, hour24: boolean, today: string): string {
  if (!r.dueAt) return '';
  const day = r.allDay ? r.dueAt.slice(0, 10) : ymd(zonedParts(new Date(r.dueAt), timeZone));
  const dayLabel =
    day === today ? 'Today' : formatYmd(day, { weekday: 'short', month: 'short', day: 'numeric' });
  return r.allDay ? dayLabel : `${dayLabel}, ${formatTime(new Date(r.dueAt), { timeZone, hour24 })}`;
}

export function HomeScreen({ screen, active }: ScreenProps) {
  const { settings, data } = useDisplay();
  const cfg = screen.config as {
    showWeather: boolean;
    showNews: boolean;
    showEvents: boolean;
    showReminders: boolean;
    headlineCount: number;
    headlineSeconds: number;
  };
  const tz = settings.location.timezone;
  const hour24 = settings.clock24h;
  const now = useNow(1000);
  const time = splitTime(now, { timeZone: tz, hour24 });
  const today = ymd(zonedParts(now, tz));

  const weather = data.weather.data;
  const todayForecast = weather?.daily.find((d) => d.date === today) ?? weather?.daily[0];

  const todayItems = useMemo(() => {
    const map = itemsByDay({
      events: data.calendar.data?.events ?? [],
      reminders: [],
      timeZone: tz,
      hour24,
      from: today,
      to: today,
    });
    return map.get(today) ?? [];
  }, [data.calendar.data, tz, hour24, today]);

  const reminders = useMemo(() => {
    const list = (data.reminders.data?.reminders ?? []).filter((r) => !r.done);
    return list.slice(0, 7);
  }, [data.reminders.data]);

  const headlines = data.news.data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil(headlines.length / cfg.headlineCount));
  const { index: page } = useCycler(pageCount, cfg.headlineSeconds, active);
  const pageItems = headlines.slice(page * cfg.headlineCount, (page + 1) * cfg.headlineCount);

  const nowMs = now.getTime();

  return (
    <div className="screen home">
      <div className="home-top">
        <div className="home-clock">
          <div className="big-time">
            {time.main}
            {time.period && <span className="period">{time.period}</span>}
          </div>
          <div className="big-date">{formatDate(now, tz)}</div>
        </div>

        {cfg.showWeather && (
          <div className="home-weather">
            {weather ? (
              <>
                <WeatherIcon code={weather.current.weatherCode} isDay={weather.current.isDay} size="7rem" />
                <div className="home-weather-main">
                  <div className="home-temp">
                    {Math.round(weather.current.temperature)}
                    <span className="unit">{tempUnit(weather.units)}</span>
                  </div>
                  <div className="home-cond">{describeWeather(weather.current.weatherCode).label}</div>
                  <div className="home-weather-meta dim">
                    {todayForecast && (
                      <span>
                        H {Math.round(todayForecast.tempMax)}° / L {Math.round(todayForecast.tempMin)}°
                      </span>
                    )}
                    <span>Feels {Math.round(weather.current.apparentTemperature)}°</span>
                    <span>
                      <Droplets size="0.9em" /> {weather.current.humidity}%
                    </span>
                    <span>
                      <Wind size="0.9em" /> {Math.round(weather.current.windSpeed)} {speedUnit(weather.units)}
                    </span>
                  </div>
                  <div className="dim small">{weather.location}</div>
                </div>
              </>
            ) : (
              <SourceStatus envelope={data.weather} emptyText="" />
            )}
          </div>
        )}
      </div>

      <div className="home-middle">
        {cfg.showEvents && (
          <Panel title="Today" icon={<CalendarDays size="1em" />} className="home-events">
            {!data.calendar.data?.connected ? (
              <p className="dim">
                {data.calendar.error ?? 'Connect Google Calendar in the admin panel to see events here.'}
              </p>
            ) : todayItems.length === 0 ? (
              <p className="dim">Nothing on the calendar today.</p>
            ) : (
              <ul className="event-list">
                {todayItems.slice(0, 7).map((item) => (
                  <li
                    key={item.key}
                    className={item.endMs !== null && item.endMs < nowMs && !item.allDay ? 'past' : ''}
                  >
                    <span className="event-dot" style={{ background: item.color }} />
                    <span className="event-time">{item.timeLabel}</span>
                    <span className="event-title">{item.title}</span>
                  </li>
                ))}
                {todayItems.length > 7 && <li className="dim">+{todayItems.length - 7} more</li>}
              </ul>
            )}
          </Panel>
        )}

        {cfg.showReminders && (
          <Panel title="Reminders" icon={<Bell size="1em" />} className="home-reminders">
            {reminders.length === 0 ? (
              <p className="dim">No open reminders.</p>
            ) : (
              <ul className="reminder-list">
                {reminders.map((r) => {
                  const overdue =
                    r.dueAt !== null &&
                    (r.allDay ? r.dueAt.slice(0, 10) < today : new Date(r.dueAt).getTime() < nowMs);
                  return (
                    <li key={r.id} className={overdue ? 'overdue' : ''}>
                      <span className="reminder-title">{r.title}</span>
                      {r.dueAt && <span className="reminder-when">{reminderWhen(r, tz, hour24, today)}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        )}
      </div>

      {cfg.showNews && (
        <Panel
          title="Headlines"
          icon={<Newspaper size="1em" />}
          className="home-news"
          aside={pageCount > 1 ? `${page + 1} / ${pageCount}` : undefined}
        >
          {pageItems.length === 0 ? (
            <SourceStatus envelope={data.news} emptyText="No headlines. Add RSS feeds in Settings." />
          ) : (
            <ul key={page} className="news-list fade-in">
              {pageItems.map((item) => (
                <li key={item.id}>
                  <span className="news-source">{item.source}</span>
                  <span className="news-title">{item.title}</span>
                  {item.publishedAt && <span className="news-age dim">{timeAgo(item.publishedAt, nowMs)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
