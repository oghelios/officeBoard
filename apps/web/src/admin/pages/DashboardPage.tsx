import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  House,
  Info,
  Pause,
  Pin,
  Play,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { DATA_SOURCES, type DataSource, type DisplayCommand, type RotationState } from '@officeboard/shared';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { useLiveFeed } from '../../lib/useLiveFeed';
import { PageHeader, Section, toast, toastError, useApi } from '../components/ui';

interface DisplayStateResponse {
  displayClients: number;
  sources: Record<DataSource, { updatedAt: string | null; error: string | null }>;
}

const SOURCE_LABELS: Record<DataSource, string> = {
  weather: 'Weather (Open-Meteo)',
  news: 'News (RSS)',
  calendar: 'Google Calendar',
  system: 'System stats',
  projects: 'Projects',
  reminders: 'Reminders',
  photos: 'Photos',
};

function Countdown({ rotation, offset }: { rotation: RotationState; offset: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!rotation.durationMs) return null;
  const remaining = Math.max(0, Math.round((rotation.startedAt + rotation.durationMs - (Date.now() + offset)) / 1000));
  return <span className="muted"> · next in {remaining}s</span>;
}

function Remote({ send }: { send: (c: DisplayCommand) => void }) {
  const btn = (cmd: DisplayCommand, content: React.ReactNode, title: string, cls = '') => (
    <button className={`remote-btn ${cls}`} title={title} onClick={() => send(cmd)}>
      {content}
    </button>
  );
  return (
    <div className="remote">
      <div className="dpad">
        <span />
        {btn({ type: 'up' }, <ChevronUp />, 'Up (scroll within screen)')}
        <span />
        {btn({ type: 'prev' }, <ChevronLeft />, 'Previous screen')}
        {btn({ type: 'select' }, 'OK', 'Screen action', 'ok')}
        {btn({ type: 'next' }, <ChevronRight />, 'Next screen')}
        <span />
        {btn({ type: 'down' }, <ChevronDown />, 'Down (scroll within screen)')}
        <span />
      </div>
      <div className="remote-row">
        {btn({ type: 'home' }, <House size={18} />, 'Home screen')}
        {btn({ type: 'pause' }, <><Play size={14} /><Pause size={14} /></>, 'Pause / resume rotation')}
        {btn({ type: 'pin' }, <Pin size={18} />, 'Pin / unpin current screen')}
        {btn({ type: 'info' }, <Info size={18} />, 'Show status on the TV')}
      </div>
      <div className="remote-numbers">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => btn({ type: 'goto', index: n }, String(n), `Screen ${n}`))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const feed = useLiveFeed('admin');
  const { data: state, reload } = useApi<DisplayStateResponse>('/api/display/state');
  useEffect(() => {
    const t = window.setInterval(() => void reload(), 5000);
    return () => window.clearInterval(t);
  }, [reload]);

  const rotation = feed.rotation;
  const screens = feed.config?.screens ?? [];
  const current = screens.find((s) => s.id === rotation?.currentScreenId);
  const pinned = screens.find((s) => s.id === rotation?.pinnedScreenId);

  async function refreshSource(source: DataSource) {
    try {
      const r = await api.post<{ error: string | null }>(`/api/data/${source}/refresh`);
      if (r.error) toast(`${SOURCE_LABELS[source]}: ${r.error}`, 'error');
      else toast(`${SOURCE_LABELS[source]} refreshed`);
      await reload();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={
          <>
            {state ? (
              <span className={state.displayClients > 0 ? 'ok-text' : 'error-text'}>
                {state.displayClients} display{state.displayClients === 1 ? '' : 's'} connected
              </span>
            ) : (
              'Loading...'
            )}
            {!feed.connected && <span className="error-text"> · live connection lost, retrying</span>}
          </>
        }
        actions={
          <button
            className="btn"
            onClick={async () => {
              await api.post('/api/display/reload').catch(toastError);
              toast('Reload sent to displays');
            }}
          >
            <RotateCcw size={15} /> Reload display
          </button>
        }
      />

      <div className="dashboard-grid">
        <Section title="Now showing">
          {rotation ? (
            <div className="now-showing">
              <div className="now-name">{current?.name ?? 'Nothing'}</div>
              <div className="small">
                {rotation.pinnedScreenId ? (
                  <span className="badge warn">Pinned{pinned && pinned.id !== current?.id ? `: ${pinned.name}` : ''}</span>
                ) : rotation.scheduleId ? (
                  <span className="badge">Scheduled</span>
                ) : rotation.paused ? (
                  <span className="badge warn">Paused</span>
                ) : (
                  <span className="badge ok">Rotating</span>
                )}
                <Countdown rotation={rotation} offset={feed.clockOffsetMs} />
              </div>
              <ol className="rotation-list">
                {screens
                  .filter((s) => s.enabled)
                  .map((s) => (
                    <li key={s.id} className={s.id === current?.id ? 'current' : ''}>
                      <button className="link-btn" onClick={() => feed.send({ type: 'goto', screenId: s.id })}>
                        {s.name}
                      </button>
                      <span className="muted small">{s.durationSec}s</span>
                    </li>
                  ))}
              </ol>
            </div>
          ) : (
            <p className="muted">Connecting...</p>
          )}
        </Section>

        <Section title="Remote" description="Works like the physical remote. Keyboard shortcuts also work on the TV.">
          <Remote send={feed.send} />
        </Section>

        <Section title="Data sources" description="Each source is cached on the Pi and pushed to the display when it changes.">
          <table className="sources">
            <tbody>
              {DATA_SOURCES.map((s) => {
                const info = state?.sources[s];
                return (
                  <tr key={s}>
                    <td>{SOURCE_LABELS[s]}</td>
                    <td className={info?.error ? 'error-text' : 'muted'}>
                      {info?.error ? info.error : `Updated ${timeAgo(info?.updatedAt ?? null)}`}
                    </td>
                    <td>
                      <button className="icon-btn" title="Refresh now" onClick={() => void refreshSource(s)}>
                        <RefreshCw size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      </div>
    </>
  );
}
