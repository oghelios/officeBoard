import { Bell, Cloud, CloudLightning, CloudRain, CloudSnow, Sun } from 'lucide-react';
import type { ThemeColors } from '@officeboard/shared';
import { themeVars } from '../../lib/theme';

/** A miniature board that uses every theme color, so edits can be judged before saving. */
export function ThemePreview({ colors, compact }: { colors: ThemeColors; compact?: boolean }) {
  return (
    <div className={`theme-preview ${compact ? 'compact' : ''}`} style={themeVars(colors)}>
      <div className="tp-top">
        <div>
          <div className="tp-time">9:41</div>
          <div className="tp-dim">Thursday, October 29</div>
        </div>
        <div className="tp-weather">
          <Sun className="tp-sun" />
          <span>65°</span>
        </div>
      </div>
      <div className="tp-panels">
        <div className="tp-panel">
          <div className="tp-label">Today</div>
          <div className="tp-row">
            <span className="tp-dot" />
            <span className="tp-dim">9:00</span> Standup
          </div>
          <div className="tp-row">
            <Bell className="tp-warn" />
            <span className="tp-bad">Overdue</span> Invoice
          </div>
          {!compact && (
            <div className="tp-tabs">
              <span className="on">Agenda</span>
              <span>Week</span>
            </div>
          )}
        </div>
        <div className="tp-panel">
          <div className="tp-label">Projects</div>
          <div className="tp-pills">
            <span className="tp-pill good">Active</span>
            <span className="tp-pill warn">On hold</span>
          </div>
          <div className="tp-bar">
            <div />
          </div>
          {!compact && <div className="tp-dim">3 of 5 done</div>}
        </div>
      </div>
      <div className="tp-icons">
        <Sun className="tp-sun" />
        <CloudRain className="tp-rain" />
        <CloudSnow className="tp-snow" />
        <CloudLightning className="tp-storm" />
        <Cloud className="tp-cloud" />
      </div>
    </div>
  );
}
