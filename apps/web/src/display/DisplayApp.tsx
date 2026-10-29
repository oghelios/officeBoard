import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarClock, Pause, Pin, WifiOff } from 'lucide-react';
import { inTimeRange, zonedParts, type SimpleCommand } from '@officeboard/shared';
import { themeVars } from '../lib/theme';
import { useLiveFeed } from '../lib/useLiveFeed';
import { DisplayContext, useNow, type CommandListener, type DisplayContextValue } from './context';
import { commandForKey } from './keymap';
import { SCREEN_COMPONENTS } from './screens/registry';
import './display.css';

const FADE_MS = 600;
const OSD_MS = 2500;

class ScreenErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="screen center-message">
          <h2>This screen hit a problem</h2>
          <p className="dim">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DisplayApp() {
  const listeners = useRef(new Set<CommandListener>());
  const [osd, setOsd] = useState<{ text: string; id: number } | null>(null);

  const showOsd = useCallback((text: string) => setOsd({ text, id: Date.now() }), []);

  const feed = useLiveFeed('display', {
    onScreenCommand: (cmd: SimpleCommand) => listeners.current.forEach((l) => l(cmd)),
    onOsd: showOsd,
    onReload: () => window.location.reload(),
    onBuildChange: () => window.location.reload(),
    onUnauthorized: () => window.location.assign('/admin/login?next=/display'),
  });
  const { config, rotation, data, connected, send } = feed;

  useEffect(() => {
    document.title = 'Office Board';
  }, []);

  useEffect(() => {
    if (!osd) return;
    const t = window.setTimeout(() => setOsd(null), OSD_MS);
    return () => window.clearTimeout(t);
  }, [osd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = commandForKey(e);
      if (!cmd) return;
      e.preventDefault();
      send(cmd);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send]);

  const subscribe = useCallback((listener: CommandListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const currentId = rotation?.currentScreenId ?? null;
  const transition = config?.settings.display.transition ?? 'fade';
  const [layers, setLayers] = useState<{ id: string; leaving: boolean }[]>([]);

  useEffect(() => {
    if (!currentId) {
      setLayers([]);
      return;
    }
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.id === currentId && !top.leaving) return prev;
      if (transition === 'none') return [{ id: currentId, leaving: false }];
      return [
        ...prev.filter((l) => l.id !== currentId).map((l) => ({ ...l, leaving: true })),
        { id: currentId, leaving: false },
      ];
    });
    const t = window.setTimeout(() => setLayers((prev) => prev.filter((l) => !l.leaving)), FADE_MS + 100);
    return () => window.clearTimeout(t);
  }, [currentId, transition]);

  const ctxValue = useMemo<DisplayContextValue | null>(
    () => (config && data ? { settings: config.settings, data, subscribe } : null),
    [config, data, subscribe],
  );

  const displaySettings = config?.settings.display;
  const now = useNow(30_000);
  const dimOpacity = useMemo(() => {
    if (!displaySettings?.dimEnabled || !config) return 0;
    const p = zonedParts(now, config.settings.location.timezone);
    return inTimeRange(p.hour * 60 + p.minute, displaySettings.dimStart, displaySettings.dimEnd)
      ? displaySettings.dimLevel
      : 0;
  }, [displaySettings, config, now]);

  const rootStyle = {
    ...(config ? themeVars(config.settings.themeColors) : {}),
    '--font-scale': String(displaySettings?.fontScale ?? 1),
  } as React.CSSProperties;

  if (!ctxValue || !config || !rotation) {
    return (
      <div className="display" style={rootStyle}>
        <div className="screen center-message">
          <div className="spinner" />
          <p className="dim">{connected ? 'Loading...' : 'Connecting to the board server...'}</p>
        </div>
      </div>
    );
  }

  const enabledScreens = config.screens.filter((s) => s.enabled);
  const isStatic = Boolean(rotation.pinnedScreenId || rotation.scheduleId || rotation.paused);

  return (
    <DisplayContext.Provider value={ctxValue}>
      <div className="display" style={rootStyle}>
        <div className="stage">
          {layers.length === 0 && (
            <div className="screen center-message">
              <h2>No screens enabled</h2>
              <p className="dim">Turn on a screen in the admin panel.</p>
            </div>
          )}
          {layers.map((layer) => {
            const screen = config.screens.find((s) => s.id === layer.id);
            if (!screen) return null;
            const ScreenComponent = SCREEN_COMPONENTS[screen.type];
            return (
              <div
                key={layer.id}
                className={`layer ${transition === 'fade' ? (layer.leaving ? 'fade-out' : 'fade-in') : ''}`}
              >
                <ScreenErrorBoundary resetKey={`${screen.id}:${rotation.startedAt}`}>
                  <ScreenComponent screen={screen} active={!layer.leaving} />
                </ScreenErrorBoundary>
              </div>
            );
          })}
        </div>

        {displaySettings?.showStatusBar && (
          <footer className="status-bar">
            <div className="status-screens">
              {enabledScreens.map((s, i) => (
                <span key={s.id} className={`status-dot ${s.id === currentId ? 'current' : ''}`}>
                  <span className="status-index">{i + 1}</span>
                  {s.id === currentId && <span className="status-name">{s.name}</span>}
                </span>
              ))}
            </div>
            <div className="status-flags">
              {rotation.pinnedScreenId && (
                <span className="flag">
                  <Pin size="1em" /> Pinned
                </span>
              )}
              {rotation.scheduleId && !rotation.pinnedScreenId && (
                <span className="flag">
                  <CalendarClock size="1em" /> Scheduled
                </span>
              )}
              {rotation.paused && !rotation.pinnedScreenId && (
                <span className="flag">
                  <Pause size="1em" /> Paused
                </span>
              )}
            </div>
          </footer>
        )}

        {!isStatic && rotation.durationMs && (
          <div className="progress">
            <div
              key={`${rotation.currentScreenId}:${rotation.startedAt}`}
              className="progress-fill"
              style={{
                animationDuration: `${rotation.durationMs}ms`,
                animationDelay: `-${Math.max(0, Date.now() + feed.clockOffsetMs - rotation.startedAt)}ms`,
              }}
            />
          </div>
        )}

        {!connected && (
          <div className="offline-badge">
            <WifiOff size="1em" /> Reconnecting...
          </div>
        )}

        {osd && (
          <div key={osd.id} className="osd">
            {osd.text}
          </div>
        )}

        {dimOpacity > 0 && <div className="dim-overlay" style={{ opacity: dimOpacity }} />}
      </div>
    </DisplayContext.Provider>
  );
}
