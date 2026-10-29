import { z } from 'zod';
import type { DataSource } from './data.js';

export const SCREEN_TYPES = [
  'home',
  'projects',
  'calendar',
  'clock',
  'photos',
  'system',
  'forecast',
] as const;
export type ScreenType = (typeof SCREEN_TYPES)[number];

export type ConfigField =
  | { key: string; label: string; kind: 'boolean'; default: boolean; help?: string }
  | {
      key: string;
      label: string;
      kind: 'number';
      default: number;
      min: number;
      max: number;
      unit?: string;
      help?: string;
    }
  | {
      key: string;
      label: string;
      kind: 'select';
      default: string;
      options: { value: string; label: string }[];
      help?: string;
    };

export interface ScreenTypeInfo {
  type: ScreenType;
  label: string;
  description: string;
  defaultDurationSec: number;
  /** Data sources the display needs in order to render this screen. */
  sources: DataSource[];
  fields: ConfigField[];
}

export const SCREEN_TYPE_INFO: Record<ScreenType, ScreenTypeInfo> = {
  home: {
    type: 'home',
    label: 'Home',
    description: 'Clock, current weather, headlines, today\'s events and upcoming reminders.',
    defaultDurationSec: 60,
    sources: ['weather', 'news', 'calendar', 'reminders'],
    fields: [
      { key: 'showWeather', label: 'Show weather', kind: 'boolean', default: true },
      { key: 'showNews', label: 'Show headlines', kind: 'boolean', default: true },
      { key: 'showEvents', label: 'Show today\'s events', kind: 'boolean', default: true },
      { key: 'showReminders', label: 'Show reminders', kind: 'boolean', default: true },
      {
        key: 'headlineCount',
        label: 'Headlines shown at once',
        kind: 'number',
        default: 5,
        min: 1,
        max: 10,
      },
      {
        key: 'headlineSeconds',
        label: 'Rotate headlines every',
        kind: 'number',
        default: 15,
        min: 3,
        max: 300,
        unit: 'sec',
      },
    ],
  },
  projects: {
    type: 'projects',
    label: 'Projects',
    description: 'Open projects as cards with their to-do lists.',
    defaultDurationSec: 45,
    sources: ['projects'],
    fields: [
      {
        key: 'showCompletedProjects',
        label: 'Include completed projects',
        kind: 'boolean',
        default: false,
      },
      { key: 'showOnHold', label: 'Include on-hold projects', kind: 'boolean', default: true },
      { key: 'showDoneTodos', label: 'Show finished to-dos', kind: 'boolean', default: true },
      {
        key: 'maxTodosPerProject',
        label: 'To-dos per card',
        kind: 'number',
        default: 8,
        min: 1,
        max: 30,
      },
      {
        key: 'projectsPerPage',
        label: 'Projects per page',
        kind: 'number',
        default: 6,
        min: 1,
        max: 12,
      },
      {
        key: 'pageSeconds',
        label: 'Flip pages every',
        kind: 'number',
        default: 15,
        min: 5,
        max: 600,
        unit: 'sec',
      },
    ],
  },
  calendar: {
    type: 'calendar',
    label: 'Calendar',
    description: 'Google Calendar events with local reminders overlaid. "OK" on the remote switches views.',
    defaultDurationSec: 45,
    sources: ['calendar', 'reminders'],
    fields: [
      {
        key: 'view',
        label: 'Default view',
        kind: 'select',
        default: 'agenda',
        options: [
          { value: 'agenda', label: 'Agenda' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ],
      },
      { key: 'agendaDays', label: 'Agenda days', kind: 'number', default: 14, min: 1, max: 60 },
      { key: 'showReminders', label: 'Overlay reminders', kind: 'boolean', default: true },
    ],
  },
  clock: {
    type: 'clock',
    label: 'Clock',
    description: 'Large local clock with configurable world clocks.',
    defaultDurationSec: 20,
    sources: [],
    fields: [
      { key: 'showSeconds', label: 'Show seconds', kind: 'boolean', default: true },
      { key: 'showWorldClocks', label: 'Show world clocks', kind: 'boolean', default: true },
    ],
  },
  photos: {
    type: 'photos',
    label: 'Photos',
    description: 'Slideshow of photos uploaded through the admin panel.',
    defaultDurationSec: 60,
    sources: ['photos'],
    fields: [
      {
        key: 'intervalSeconds',
        label: 'Change photo every',
        kind: 'number',
        default: 12,
        min: 3,
        max: 600,
        unit: 'sec',
      },
      { key: 'shuffle', label: 'Shuffle', kind: 'boolean', default: true },
      {
        key: 'fit',
        label: 'Fit',
        kind: 'select',
        default: 'contain',
        options: [
          { value: 'contain', label: 'Whole photo (letterbox)' },
          { value: 'cover', label: 'Fill screen (crop)' },
        ],
      },
      { key: 'showCaption', label: 'Show captions', kind: 'boolean', default: true },
    ],
  },
  system: {
    type: 'system',
    label: 'System',
    description: 'Raspberry Pi health, network and internet status.',
    defaultDurationSec: 20,
    sources: ['system'],
    fields: [],
  },
  forecast: {
    type: 'forecast',
    label: 'Forecast',
    description: 'Multi-day forecast with hourly detail.',
    defaultDurationSec: 30,
    sources: ['weather'],
    fields: [
      { key: 'days', label: 'Days', kind: 'number', default: 7, min: 3, max: 14 },
      { key: 'hours', label: 'Hours of hourly detail', kind: 'number', default: 24, min: 6, max: 48 },
    ],
  },
};

function fieldSchema(field: ConfigField): z.ZodType {
  switch (field.kind) {
    case 'boolean':
      return z.boolean().catch(field.default);
    case 'number':
      return z.number().min(field.min).max(field.max).catch(field.default);
    case 'select':
      return z
        .enum(field.options.map((o) => o.value) as [string, ...string[]])
        .catch(field.default);
  }
}

const configSchemas = Object.fromEntries(
  SCREEN_TYPES.map((type) => {
    const shape = Object.fromEntries(
      SCREEN_TYPE_INFO[type].fields.map((f) => [f.key, fieldSchema(f)]),
    );
    return [type, z.object(shape)];
  }),
) as Record<ScreenType, z.ZodObject>;

/** Fills defaults and replaces invalid values so screens can trust their config. */
export function normalizeScreenConfig(type: ScreenType, raw: unknown): Record<string, unknown> {
  const input = raw && typeof raw === 'object' ? raw : {};
  const result = configSchemas[type].safeParse(input);
  return result.success ? (result.data as Record<string, unknown>) : {};
}

export function defaultScreenConfig(type: ScreenType): Record<string, unknown> {
  return normalizeScreenConfig(type, {});
}

export interface ScreenInstance {
  id: string;
  type: ScreenType;
  name: string;
  enabled: boolean;
  durationSec: number;
  sortOrder: number;
  config: Record<string, unknown>;
}

export const screenInputSchema = z.object({
  type: z.enum(SCREEN_TYPES),
  name: z.string().trim().min(1).max(60),
  enabled: z.boolean().default(true),
  durationSec: z.number().int().min(5).max(86400).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const screenPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  enabled: z.boolean().optional(),
  durationSec: z.number().int().min(5).max(86400).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
