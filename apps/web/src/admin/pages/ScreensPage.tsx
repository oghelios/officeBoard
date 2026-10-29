import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import {
  SCREEN_TYPE_INFO,
  SCREEN_TYPES,
  type ConfigField,
  type ScheduleRule,
  type ScreenInstance,
  type ScreenType,
} from '@officeboard/shared';
import { api } from '../../lib/api';
import { useLiveFeed } from '../../lib/useLiveFeed';
import { CommitInput, NumberInput, PageHeader, Section, Toggle, confirmAction, toastError } from '../components/ui';
import { useSettings } from '../useSettings';
import { DayPicker } from '../components/DayPicker';

async function patchScreen(id: string, body: Record<string, unknown>) {
  try {
    await api.patch(`/api/screens/${id}`, body);
  } catch (err) {
    toastError(err);
  }
}

function ConfigEditor({ screen }: { screen: ScreenInstance }) {
  const fields = SCREEN_TYPE_INFO[screen.type].fields;
  if (fields.length === 0) return <p className="muted small">This screen has no options.</p>;
  const set = (key: string, value: unknown) => void patchScreen(screen.id, { config: { [key]: value } });
  const render = (f: ConfigField) => {
    const value = screen.config[f.key];
    switch (f.kind) {
      case 'boolean':
        return <Toggle checked={Boolean(value)} onChange={(v) => set(f.key, v)} label={f.label} />;
      case 'number':
        return (
          <label className="field">
            <span>
              {f.label}
              {f.unit && ` (${f.unit})`}
            </span>
            <NumberInput value={Number(value)} min={f.min} max={f.max} onCommit={(v) => set(f.key, v)} />
          </label>
        );
      case 'select':
        return (
          <label className="field">
            <span>{f.label}</span>
            <select value={String(value)} onChange={(e) => set(f.key, e.target.value)}>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        );
    }
  };
  return (
    <div className="config-grid">
      {fields.map((f) => (
        <div key={f.key}>{render(f)}</div>
      ))}
    </div>
  );
}

function ScreenRow({
  screen,
  index,
  count,
  isCurrent,
  isPinned,
  onMove,
}: {
  screen: ScreenInstance;
  index: number;
  count: number;
  isCurrent: boolean;
  isPinned: boolean;
  onMove: (delta: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const info = SCREEN_TYPE_INFO[screen.type];
  return (
    <li className={`screen-row ${screen.enabled ? '' : 'disabled'} ${isCurrent ? 'current' : ''}`}>
      <div className="screen-row-main">
        <div className="row-actions vertical">
          <button className="icon-btn" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp size={14} />
          </button>
          <button className="icon-btn" title="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown size={14} />
          </button>
        </div>
        <Toggle checked={screen.enabled} onChange={(enabled) => void patchScreen(screen.id, { enabled })} />
        <button className="icon-btn" title="Options" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="screen-name">
          <CommitInput className="inline-input" value={screen.name} onCommit={(name) => name.trim() && void patchScreen(screen.id, { name })} />
          <span className="muted small">
            {info.label}
            {isCurrent && <span className="badge ok">On screen</span>}
            {isPinned && <span className="badge warn">Pinned</span>}
          </span>
        </div>
        <label className="duration">
          <NumberInput value={screen.durationSec} min={5} max={86400} onCommit={(durationSec) => void patchScreen(screen.id, { durationSec })} />
          <span className="muted small">sec</span>
        </label>
        <div className="row-actions">
          <button
            className="icon-btn"
            title="Show now"
            onClick={() => void api.post('/api/display/command', { command: { type: 'goto', screenId: screen.id } }).catch(toastError)}
          >
            <Eye size={16} />
          </button>
          <button
            className={`icon-btn ${isPinned ? 'active' : ''}`}
            title={isPinned ? 'Unpin (resume rotation)' : 'Pin: keep this screen static'}
            onClick={() => void api.post('/api/display/pin', { screenId: isPinned ? null : screen.id }).catch(toastError)}
          >
            {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
          <button
            className="icon-btn danger"
            title="Delete screen"
            onClick={async () => {
              if (!confirmAction(`Delete the "${screen.name}" screen?`)) return;
              await api.del(`/api/screens/${screen.id}`).catch(toastError);
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {open && (
        <div className="screen-config">
          <p className="muted small">{info.description}</p>
          <ConfigEditor screen={screen} />
        </div>
      )}
    </li>
  );
}

function SchedulesSection({ screens }: { screens: ScreenInstance[] }) {
  const { settings, save } = useSettings();
  if (!settings) return null;
  const rules = settings.schedules;
  const update = (i: number, patch: Partial<ScheduleRule>) =>
    void save({ schedules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <Section
      title="Schedules"
      description="Show a specific screen, without rotating, during a time window (for example Calendar from 8:00 to 9:00 on weekdays). A pinned screen takes priority over schedules."
      actions={
        <button
          className="btn small"
          disabled={screens.length === 0}
          onClick={() =>
            void save({
              schedules: [
                ...rules,
                {
                  id: Math.random().toString(36).slice(2, 10),
                  screenId: screens[0].id,
                  days: [1, 2, 3, 4, 5],
                  start: '08:00',
                  end: '09:00',
                  enabled: true,
                },
              ],
            })
          }
        >
          <Plus size={14} /> Add schedule
        </button>
      }
    >
      {rules.length === 0 && <p className="muted">No schedules. The board rotates through enabled screens all day.</p>}
      <ul className="schedule-list">
        {rules.map((r, i) => (
          <li key={r.id}>
            <Toggle checked={r.enabled} onChange={(enabled) => update(i, { enabled })} />
            <select value={r.screenId} onChange={(e) => update(i, { screenId: e.target.value })}>
              {screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input type="time" value={r.start} onChange={(e) => e.target.value && update(i, { start: e.target.value })} />
            <span className="muted">to</span>
            <input type="time" value={r.end} onChange={(e) => e.target.value && update(i, { end: e.target.value })} />
            <DayPicker days={r.days} onChange={(days) => update(i, { days })} />
            <button className="icon-btn danger" title="Remove" onClick={() => void save({ schedules: rules.filter((_, j) => j !== i) })}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function ScreensPage() {
  const feed = useLiveFeed('admin');
  const screens = feed.config?.screens ?? [];
  const rotation = feed.rotation;
  const [newType, setNewType] = useState<ScreenType>('clock');

  async function move(index: number, delta: number) {
    const ids = screens.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await api.put('/api/screens/order', { ids }).catch(toastError);
  }

  async function add() {
    const label = SCREEN_TYPE_INFO[newType].label;
    const count = screens.filter((s) => s.type === newType).length;
    await api.post('/api/screens', { type: newType, name: count ? `${label} ${count + 1}` : label }).catch(toastError);
  }

  const totalSec = screens.filter((s) => s.enabled).reduce((n, s) => n + s.durationSec, 0);

  return (
    <>
      <PageHeader
        title="Screens"
        subtitle="The board rotates through enabled screens in this order. Pin a screen to keep it static."
        actions={
          rotation && (
            <div className="button-row">
              <Toggle
                checked={!rotation.paused}
                onChange={(on) => void api.post('/api/display/paused', { paused: !on }).catch(toastError)}
                label={rotation.paused ? 'Rotation paused' : 'Rotating'}
              />
              {rotation.pinnedScreenId && (
                <button className="btn small" onClick={() => void api.post('/api/display/pin', { screenId: null }).catch(toastError)}>
                  <PinOff size={14} /> Unpin
                </button>
              )}
            </div>
          )
        }
      />

      <Section
        title="Rotation"
        description={`${screens.filter((s) => s.enabled).length} enabled screens, one full cycle every ${Math.round(totalSec / 60)} min ${totalSec % 60} s.`}
        actions={
          <div className="inline-form">
            <select value={newType} onChange={(e) => setNewType(e.target.value as ScreenType)}>
              {SCREEN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SCREEN_TYPE_INFO[t].label}
                </option>
              ))}
            </select>
            <button className="btn small" onClick={() => void add()}>
              <Plus size={14} /> Add screen
            </button>
          </div>
        }
      >
        {!feed.connected && !feed.config && <p className="muted">Connecting...</p>}
        <ul className="screen-list">
          {screens.map((s, i) => (
            <ScreenRow
              key={s.id}
              screen={s}
              index={i}
              count={screens.length}
              isCurrent={rotation?.currentScreenId === s.id}
              isPinned={rotation?.pinnedScreenId === s.id}
              onMove={(d) => void move(i, d)}
            />
          ))}
        </ul>
      </Section>

      <SchedulesSection screens={screens} />
    </>
  );
}
