import { z } from 'zod';
import { customThemeSchema, DEFAULT_THEME_ID, resolveThemeColors, type ThemeColors } from './themes.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24-hour)');
const weekdays = z.array(z.number().int().min(0).max(6));

export const locationSchema = z.object({
  name: z.string().default('New York, NY'),
  latitude: z.number().min(-90).max(90).default(40.7128),
  longitude: z.number().min(-180).max(180).default(-74.006),
  timezone: z.string().default('America/New_York'),
});

export const worldClockSchema = z.object({
  label: z.string().trim().min(1).max(40),
  timezone: z.string().min(1),
});

export const newsFeedSchema = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.url(),
  enabled: z.boolean().default(true),
});

export const scheduleSchema = z.object({
  id: z.string().min(1),
  screenId: z.string().min(1),
  days: weekdays.default([0, 1, 2, 3, 4, 5, 6]),
  start: hhmm,
  end: hhmm,
  enabled: z.boolean().default(true),
});
export type ScheduleRule = z.infer<typeof scheduleSchema>;

export const displaySettingsSchema = z.object({
  /** A preset id from THEME_PRESETS or the id of one of `customThemes`. */
  theme: z.string().min(1).default(DEFAULT_THEME_ID),
  fontScale: z.number().min(0.6).max(1.8).default(1),
  transition: z.enum(['fade', 'none']).default('fade'),
  showStatusBar: z.boolean().default(true),
  dimEnabled: z.boolean().default(false),
  dimStart: hhmm.default('22:00'),
  dimEnd: hhmm.default('07:00'),
  /** 0 = no dimming, 0.95 = nearly black. */
  dimLevel: z.number().min(0).max(0.95).default(0.6),
});
export type DisplaySettings = z.infer<typeof displaySettingsSchema>;

export const tvPowerSchema = z.object({
  enabled: z.boolean().default(false),
  onTime: hhmm.default('08:00'),
  offTime: hhmm.default('18:00'),
  days: weekdays.default([1, 2, 3, 4, 5]),
});

export const inputSettingsSchema = z.object({
  ir: z
    .object({
      enabled: z.boolean().default(false),
      /** e.g. /dev/input/by-path/platform-ir-receiver@12-event */
      devicePath: z.string().default(''),
    })
    .prefault({}),
  cec: z
    .object({
      enabled: z.boolean().default(false),
      command: z.string().default('cec-client'),
    })
    .prefault({}),
});

export const googleSettingsSchema = z.object({
  clientId: z.string().default(''),
  calendarIds: z.array(z.string()).default([]),
  /** Public base URL (e.g. https://board.example.com) used to build the OAuth redirect URI. */
  publicUrl: z.string().default(''),
});

export const rotationSettingsSchema = z.object({
  paused: z.boolean().default(false),
  pinnedScreenId: z.string().nullable().default(null),
});

export const settingsSchema = z.object({
  location: locationSchema.prefault({}),
  units: z.enum(['imperial', 'metric']).default('imperial'),
  clock24h: z.boolean().default(false),
  worldClocks: z.array(worldClockSchema).default([
    { label: 'London', timezone: 'Europe/London' },
    { label: 'Tokyo', timezone: 'Asia/Tokyo' },
    { label: 'Los Angeles', timezone: 'America/Los_Angeles' },
  ]),
  newsFeeds: z.array(newsFeedSchema).default([
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', enabled: true },
    { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', enabled: true },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', enabled: true },
  ]),
  refresh: z
    .object({
      weatherMinutes: z.number().int().min(5).max(180).default(15),
      newsMinutes: z.number().int().min(5).max(180).default(15),
      calendarMinutes: z.number().int().min(1).max(120).default(5),
    })
    .prefault({}),
  display: displaySettingsSchema.prefault({}),
  customThemes: z
    .array(customThemeSchema)
    .max(30)
    .default([])
    .refine((list) => new Set(list.map((t) => t.id)).size === list.length, 'Theme ids must be unique'),
  schedules: z.array(scheduleSchema).default([]),
  tvPower: tvPowerSchema.prefault({}),
  input: inputSettingsSchema.prefault({}),
  google: googleSettingsSchema.prefault({}),
  rotation: rotationSettingsSchema.prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;

export function defaultSettings(): Settings {
  return settingsSchema.parse({});
}

/** The subset of settings the TV display needs, with the active theme resolved to colors. */
export type DisplayFacingSettings = Pick<
  Settings,
  'location' | 'units' | 'clock24h' | 'worldClocks' | 'display'
> & { themeColors: ThemeColors };

export function pickDisplaySettings(s: Settings): DisplayFacingSettings {
  return {
    location: s.location,
    units: s.units,
    clock24h: s.clock24h,
    worldClocks: s.worldClocks,
    display: s.display,
    themeColors: resolveThemeColors(s.display.theme, s.customThemes),
  };
}
