import type { CSSProperties } from 'react';
import { contrastText, type ThemeColors } from '@officeboard/shared';

/** CSS custom properties consumed by display.css (and the admin theme preview). */
export function themeVars(c: ThemeColors): CSSProperties {
  return {
    '--bg': c.bg,
    '--panel': c.panel,
    '--panel-2': c.panelAlt,
    '--border': c.border,
    '--text': c.text,
    '--dim': c.dim,
    '--accent': c.accent,
    '--accent-contrast': contrastText(c.accent),
    '--good': c.good,
    '--warn': c.warn,
    '--bad': c.bad,
    '--bad-contrast': contrastText(c.bad),
    '--sun': c.sun,
    '--rain': c.rain,
    '--snow': c.snow,
    '--storm': c.storm,
    '--cloud': c.cloud,
  } as CSSProperties;
}
