import { z } from 'zod';

export const THEME_COLOR_KEYS = [
  'bg',
  'panel',
  'panelAlt',
  'border',
  'text',
  'dim',
  'accent',
  'good',
  'warn',
  'bad',
  'sun',
  'rain',
  'snow',
  'storm',
  'cloud',
] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColors = Record<ThemeColorKey, string>;

export type ThemeColorGroup = 'Surfaces' | 'Text and accent' | 'Status' | 'Weather icons';

export const THEME_COLOR_INFO: { key: ThemeColorKey; label: string; group: ThemeColorGroup; help: string }[] = [
  { key: 'bg', label: 'Background', group: 'Surfaces', help: 'Behind everything' },
  { key: 'panel', label: 'Panels', group: 'Surfaces', help: 'Cards, tiles and calendar cells' },
  { key: 'panelAlt', label: 'Panel highlight', group: 'Surfaces', help: 'Notices and secondary fills' },
  { key: 'border', label: 'Borders', group: 'Surfaces', help: 'Outlines, dividers and empty progress bars' },
  { key: 'text', label: 'Text', group: 'Text and accent', help: 'Main text and the big clock' },
  { key: 'dim', label: 'Secondary text', group: 'Text and accent', help: 'Labels, dates and captions' },
  { key: 'accent', label: 'Accent', group: 'Text and accent', help: 'Today, active tabs, progress bar, news sources' },
  { key: 'good', label: 'Good', group: 'Status', help: 'Active projects, online, healthy meters' },
  { key: 'warn', label: 'Warning', group: 'Status', help: 'Reminders, on-hold, pinned/paused flags' },
  { key: 'bad', label: 'Alert', group: 'Status', help: 'Overdue items, offline, high usage' },
  { key: 'sun', label: 'Sun', group: 'Weather icons', help: 'Clear and partly cloudy icons' },
  { key: 'rain', label: 'Rain', group: 'Weather icons', help: 'Rain icons and precipitation chances' },
  { key: 'snow', label: 'Snow', group: 'Weather icons', help: 'Snow icons' },
  { key: 'storm', label: 'Storm', group: 'Weather icons', help: 'Thunderstorm icons' },
  { key: 'cloud', label: 'Cloud', group: 'Weather icons', help: 'Overcast and fog icons' },
];

const DARK: ThemeColors = {
  bg: '#0b0f17',
  panel: '#121a29',
  panelAlt: '#172135',
  border: '#22304a',
  text: '#e8edf5',
  dim: '#8d9ab0',
  accent: '#60a5fa',
  good: '#22c55e',
  warn: '#f59e0b',
  bad: '#ef4444',
  sun: '#fbbf24',
  rain: '#60a5fa',
  snow: '#e0f2fe',
  storm: '#c084fc',
  cloud: '#94a3b8',
};

export const THEME_PRESETS: { id: string; name: string; colors: ThemeColors }[] = [
  { id: 'dark', name: 'Dark', colors: DARK },
  {
    id: 'midnight',
    name: 'Midnight (true black)',
    colors: {
      ...DARK,
      bg: '#000000',
      panel: '#0a0a0c',
      panelAlt: '#111114',
      border: '#1c1c22',
      text: '#d8d8de',
      dim: '#7a7a86',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite (greys)',
    colors: {
      bg: '#121212',
      panel: '#1c1c1c',
      panelAlt: '#242424',
      border: '#333333',
      text: '#e6e6e6',
      dim: '#8c8c8c',
      accent: '#bdbdbd',
      good: '#a8a8a8',
      warn: '#cfcfcf',
      bad: '#f5f5f5',
      sun: '#e0e0e0',
      rain: '#9e9e9e',
      snow: '#f0f0f0',
      storm: '#c4c4c4',
      cloud: '#7a7a7a',
    },
  },
  {
    id: 'light',
    name: 'Light',
    colors: {
      bg: '#eef2f7',
      panel: '#ffffff',
      panelAlt: '#f5f7fb',
      border: '#d9e0ea',
      text: '#111827',
      dim: '#5b6474',
      accent: '#2563eb',
      good: '#16a34a',
      warn: '#d97706',
      bad: '#dc2626',
      sun: '#d97706',
      rain: '#2563eb',
      snow: '#64748b',
      storm: '#9333ea',
      cloud: '#64748b',
    },
  },
];

export const DEFAULT_THEME_ID = 'dark';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex color like #1a2b3c');

export const themeColorsSchema = z.object(
  Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, hex.catch(DARK[k])])) as Record<ThemeColorKey, z.ZodCatch<z.ZodString>>,
);

export const customThemeSchema = z.object({
  id: z.string().regex(/^custom-[a-z0-9-]{1,40}$/, 'Custom theme ids start with "custom-"'),
  name: z.string().trim().min(1).max(40),
  colors: themeColorsSchema,
});
export type CustomTheme = z.infer<typeof customThemeSchema>;

/** Colors for a theme id, falling back to the default theme if it no longer exists. */
export function resolveThemeColors(themeId: string, customThemes: CustomTheme[]): ThemeColors {
  return (
    customThemes.find((t) => t.id === themeId)?.colors ??
    THEME_PRESETS.find((t) => t.id === themeId)?.colors ??
    DARK
  );
}

/** Black or white, whichever reads better on top of `hexColor`. */
export function contrastText(hexColor: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hexColor);
  if (!m) return '#ffffff';
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#000000' : '#ffffff';
}
