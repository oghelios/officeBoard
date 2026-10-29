import { Droplets, Sunrise, Sunset, Umbrella, Wind } from 'lucide-react';
import { describeWeather, windDirectionLabel } from '@officeboard/shared';
import { formatLocalClock, formatLocalHour, formatYmd, speedUnit, tempUnit } from '../../lib/format';
import { Panel, SourceStatus, WeatherIcon } from '../components';
import { useDisplay, type ScreenProps } from '../context';

export function ForecastScreen({ screen }: ScreenProps) {
  const { settings, data } = useDisplay();
  const cfg = screen.config as { days: number; hours: number };
  const weather = data.weather.data;
  const hour24 = settings.clock24h;

  if (!weather) {
    return (
      <div className="screen center-message">
        <SourceStatus envelope={data.weather} emptyText="" />
      </div>
    );
  }

  const days = weather.daily.slice(0, cfg.days);
  const allMax = Math.max(...days.map((d) => d.tempMax));
  const allMin = Math.min(...days.map((d) => d.tempMin));
  const span = Math.max(1, allMax - allMin);

  // Keep the hourly strip readable: at most ~16 columns.
  const hours = weather.hourly.slice(0, cfg.hours);
  const step = Math.max(1, Math.ceil(hours.length / 16));
  const shownHours = hours.filter((_, i) => i % step === 0);
  const today = days[0];
  const c = weather.current;

  return (
    <div className="screen forecast">
      <div className="forecast-now">
        <WeatherIcon code={c.weatherCode} isDay={c.isDay} size="6rem" />
        <div>
          <div className="forecast-temp">
            {Math.round(c.temperature)}
            <span className="unit">{tempUnit(weather.units)}</span>
          </div>
          <div className="forecast-cond">{describeWeather(c.weatherCode).label}</div>
        </div>
        <div className="forecast-facts">
          <span>Feels like {Math.round(c.apparentTemperature)}°</span>
          <span>
            <Droplets size="1em" /> Humidity {c.humidity}%
          </span>
          <span>
            <Wind size="1em" /> {Math.round(c.windSpeed)} {speedUnit(weather.units)} {windDirectionLabel(c.windDirection)}
          </span>
          {today && (
            <>
              <span>
                <Sunrise size="1em" /> {formatLocalClock(today.sunrise, hour24)}
              </span>
              <span>
                <Sunset size="1em" /> {formatLocalClock(today.sunset, hour24)}
              </span>
              {today.uvIndexMax !== null && <span>UV index {Math.round(today.uvIndexMax)}</span>}
            </>
          )}
        </div>
        <div className="forecast-location dim">{weather.location}</div>
      </div>

      <Panel title={`Next ${hours.length} hours`} className="forecast-hourly">
        <div className="hourly" style={{ gridTemplateColumns: `repeat(${shownHours.length}, 1fr)` }}>
          {shownHours.map((h) => (
            <div key={h.time} className="hour">
              <div className="dim">{formatLocalHour(h.time, hour24)}</div>
              <WeatherIcon code={h.weatherCode} isDay={h.isDay} size="2.4rem" />
              <div className="hour-temp">{Math.round(h.temperature)}°</div>
              <div className="hour-precip">
                {h.precipitationProbability !== null && h.precipitationProbability > 0
                  ? `${h.precipitationProbability}%`
                  : ''}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="daily" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map((d, i) => (
          <div key={d.date} className="day">
            <div className="day-name">{i === 0 ? 'Today' : formatYmd(d.date, { weekday: 'short' })}</div>
            <div className="dim small">{formatYmd(d.date, { month: 'short', day: 'numeric' })}</div>
            <WeatherIcon code={d.weatherCode} size="3.4rem" />
            <div className="day-cond dim small">{describeWeather(d.weatherCode).label}</div>
            <div className="day-temps">
              <span className="hi">{Math.round(d.tempMax)}°</span>
              <span className="lo">{Math.round(d.tempMin)}°</span>
            </div>
            <div className="temp-bar">
              <div
                className="temp-bar-fill"
                style={{
                  left: `${((d.tempMin - allMin) / span) * 100}%`,
                  right: `${((allMax - d.tempMax) / span) * 100}%`,
                }}
              />
            </div>
            <div className="day-precip">
              {d.precipitationProbability !== null && (
                <>
                  <Umbrella size="0.9em" /> {d.precipitationProbability}%
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
