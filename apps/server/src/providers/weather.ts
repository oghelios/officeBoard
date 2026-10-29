import { isValidTimeZone, type Settings, type WeatherData } from '@officeboard/shared';
import { fetchJson } from '../lib/http.js';

interface OpenMeteoResponse {
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    is_day: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: (number | null)[];
    weather_code: number[];
    is_day: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
    precipitation_sum: (number | null)[];
    sunrise: (string | null)[];
    sunset: (string | null)[];
    wind_speed_10m_max: (number | null)[];
    uv_index_max: (number | null)[];
  };
}

export async function fetchWeather(settings: Settings): Promise<WeatherData> {
  const { location, units } = settings;
  const imperial = units === 'imperial';
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: isValidTimeZone(location.timezone) ? location.timezone : 'auto',
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'is_day',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
    ].join(','),
    hourly: ['temperature_2m', 'precipitation_probability', 'weather_code', 'is_day'].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'precipitation_sum',
      'sunrise',
      'sunset',
      'wind_speed_10m_max',
      'uv_index_max',
    ].join(','),
    forecast_days: '14',
    temperature_unit: imperial ? 'fahrenheit' : 'celsius',
    wind_speed_unit: imperial ? 'mph' : 'kmh',
    precipitation_unit: imperial ? 'inch' : 'mm',
  });
  const r = await fetchJson<OpenMeteoResponse>(`https://api.open-meteo.com/v1/forecast?${params}`);

  // Hourly data starts at midnight; keep the next 48 hours from the current hour on.
  const currentHour = r.current.time.slice(0, 13);
  const startIdx = Math.max(0, r.hourly.time.findIndex((t) => t.slice(0, 13) >= currentHour));

  return {
    location: location.name,
    units,
    timezone: r.timezone,
    current: {
      time: r.current.time,
      temperature: r.current.temperature_2m,
      apparentTemperature: r.current.apparent_temperature,
      humidity: r.current.relative_humidity_2m,
      windSpeed: r.current.wind_speed_10m,
      windDirection: r.current.wind_direction_10m,
      weatherCode: r.current.weather_code,
      isDay: r.current.is_day === 1,
      precipitation: r.current.precipitation,
    },
    hourly: r.hourly.time.slice(startIdx, startIdx + 48).map((time, j) => {
      const i = startIdx + j;
      return {
        time,
        temperature: r.hourly.temperature_2m[i],
        precipitationProbability: r.hourly.precipitation_probability[i] ?? null,
        weatherCode: r.hourly.weather_code[i],
        isDay: r.hourly.is_day[i] === 1,
      };
    }),
    daily: r.daily.time.map((date, i) => ({
      date,
      weatherCode: r.daily.weather_code[i],
      tempMax: r.daily.temperature_2m_max[i],
      tempMin: r.daily.temperature_2m_min[i],
      precipitationProbability: r.daily.precipitation_probability_max[i] ?? null,
      precipitationSum: r.daily.precipitation_sum[i] ?? null,
      sunrise: r.daily.sunrise[i] ?? null,
      sunset: r.daily.sunset[i] ?? null,
      windSpeedMax: r.daily.wind_speed_10m_max[i] ?? null,
      uvIndexMax: r.daily.uv_index_max[i] ?? null,
    })),
  };
}
