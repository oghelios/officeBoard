import type { Photo, ProjectWithTodos, Reminder } from './models.js';

export const DATA_SOURCES = [
  'weather',
  'news',
  'calendar',
  'system',
  'projects',
  'reminders',
  'photos',
] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export interface WeatherCurrent {
  time: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  weatherCode: number;
  isDay: boolean;
  precipitation: number;
}

export interface WeatherHour {
  time: string;
  temperature: number;
  precipitationProbability: number | null;
  weatherCode: number;
  isDay: boolean;
}

export interface WeatherDay {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationProbability: number | null;
  precipitationSum: number | null;
  sunrise: string | null;
  sunset: string | null;
  windSpeedMax: number | null;
  uvIndexMax: number | null;
}

export interface WeatherData {
  location: string;
  units: 'imperial' | 'metric';
  /** Times from Open-Meteo are local to this timezone and have no offset. */
  timezone: string;
  current: WeatherCurrent;
  hourly: WeatherHour[];
  daily: WeatherDay[];
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  link: string | null;
  publishedAt: string | null;
}

export interface NewsData {
  items: NewsItem[];
  errors: { feed: string; message: string }[];
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  /** ISO timestamp, or YYYY-MM-DD for all-day events. */
  start: string;
  /** ISO timestamp, or YYYY-MM-DD (exclusive) for all-day events. */
  end: string;
  allDay: boolean;
  location: string | null;
  color: string;
}

export interface CalendarData {
  connected: boolean;
  calendars: { id: string; name: string; color: string }[];
  events: CalendarEvent[];
}

export interface SystemData {
  hostname: string;
  platform: string;
  model: string | null;
  cpuLoad: number;
  cpuTemp: number | null;
  memUsed: number;
  memTotal: number;
  disk: { mount: string; used: number; size: number } | null;
  uptimeSec: number;
  serverUptimeSec: number;
  addresses: { iface: string; address: string }[];
  internet: { online: boolean; latencyMs: number | null; checkedAt: string | null };
  nodeVersion: string;
  displayClients: number;
}

export interface ProjectsData {
  projects: ProjectWithTodos[];
}

export interface RemindersData {
  reminders: Reminder[];
}

export interface PhotosData {
  photos: (Photo & { url: string })[];
}

export interface DataMap {
  weather: WeatherData;
  news: NewsData;
  calendar: CalendarData;
  system: SystemData;
  projects: ProjectsData;
  reminders: RemindersData;
  photos: PhotosData;
}

export interface DataEnvelope<T> {
  data: T | null;
  updatedAt: string | null;
  error: string | null;
}

export type DataState = { [K in DataSource]: DataEnvelope<DataMap[K]> };
