import { useEffect, useState, type FormEvent } from 'react';
import { MapPin, Plus, Power, PowerOff, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { THEME_PRESETS, type Settings } from '@officeboard/shared';
import { api } from '../../lib/api';
import { DayPicker } from '../components/DayPicker';
import { CommitInput, NumberInput, PageHeader, RangeField, Section, Toggle, toast, toastError, useApi } from '../components/ui';
import { useSettings } from '../useSettings';

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface AdapterStatus {
  enabled: boolean;
  running: boolean;
  detail: string | null;
  error: string | null;
  lastInput: string | null;
}

interface InputStatus {
  ir: AdapterStatus;
  cec: AdapterStatus;
  tvPower: { enabled: boolean; desired: 'on' | 'off' | null; lastAction: string | null; lastError: string | null };
}

type Save = (patch: Parameters<ReturnType<typeof useSettings>['save']>[0]) => Promise<boolean>;

function TimezoneSelect({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const { data: zones } = useApi<string[]>('/api/timezones');
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {!zones?.includes(value) && <option value={value}>{value}</option>}
      {zones?.map((z) => (
        <option key={z} value={z}>
          {z}
        </option>
      ))}
    </select>
  );
}

function LocationSection({ settings, save }: { settings: Settings; save: Save }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await api.get<GeoResult[]>(`/api/geocode?q=${encodeURIComponent(query.trim())}`));
    } catch (err) {
      toastError(err);
    } finally {
      setSearching(false);
    }
  }

  return (
    <Section title="Location and units" description="Used for weather, clocks, schedules and calendar days.">
      <p className="current-location">
        <MapPin size={16} /> <strong>{settings.location.name}</strong>
        <span className="muted small">
          {settings.location.latitude.toFixed(3)}, {settings.location.longitude.toFixed(3)} · {settings.location.timezone}
        </span>
      </p>
      <form className="inline-form" onSubmit={search}>
        <input placeholder="Search for a city or ZIP code" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn" disabled={searching}>
          <Search size={15} /> Search
        </button>
      </form>
      {results && (
        <ul className="geo-results">
          {results.length === 0 && <li className="muted">No matches.</li>}
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button
                className="link-btn"
                onClick={async () => {
                  if (await save({ location: r })) {
                    setResults(null);
                    setQuery('');
                    toast(`Location set to ${r.name}`);
                  }
                }}
              >
                {r.name}
              </button>
              <span className="muted small"> {r.timezone}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="form-grid">
        <label className="field">
          <span>Location name shown on screen</span>
          <CommitInput value={settings.location.name} onCommit={(name) => void save({ location: { name } })} />
        </label>
        <label className="field">
          <span>Time zone</span>
          <TimezoneSelect value={settings.location.timezone} onChange={(timezone) => void save({ location: { timezone } })} />
        </label>
        <label className="field">
          <span>Units</span>
          <select value={settings.units} onChange={(e) => void save({ units: e.target.value as Settings['units'] })}>
            <option value="imperial">Imperial (°F, mph)</option>
            <option value="metric">Metric (°C, km/h)</option>
          </select>
        </label>
        <div className="field">
          <span>Clock</span>
          <Toggle checked={settings.clock24h} onChange={(clock24h) => void save({ clock24h })} label="24-hour time" />
        </div>
      </div>
    </Section>
  );
}

function WorldClocksSection({ settings, save }: { settings: Settings; save: Save }) {
  const clocks = settings.worldClocks;
  const [label, setLabel] = useState('');
  const [timezone, setTimezone] = useState('Europe/London');
  return (
    <Section title="World clocks" description="Shown on the Clock screen.">
      <ul className="edit-list">
        {clocks.map((c, i) => (
          <li key={`${c.label}-${i}`}>
            <CommitInput
              value={c.label}
              onCommit={(v) => v.trim() && void save({ worldClocks: clocks.map((x, j) => (j === i ? { ...x, label: v } : x)) })}
            />
            <TimezoneSelect
              value={c.timezone}
              onChange={(tz) => void save({ worldClocks: clocks.map((x, j) => (j === i ? { ...x, timezone: tz } : x)) })}
            />
            <button className="icon-btn danger" title="Remove" onClick={() => void save({ worldClocks: clocks.filter((_, j) => j !== i) })}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!label.trim()) return;
          if (await save({ worldClocks: [...clocks, { label: label.trim(), timezone }] })) setLabel('');
        }}
      >
        <input placeholder="Label, e.g. Berlin office" value={label} onChange={(e) => setLabel(e.target.value)} />
        <TimezoneSelect value={timezone} onChange={setTimezone} />
        <button className="btn" disabled={!label.trim()}>
          <Plus size={15} /> Add
        </button>
      </form>
    </Section>
  );
}

function NewsSection({ settings, save }: { settings: Settings; save: Save }) {
  const feeds = settings.newsFeeds;
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  return (
    <Section
      title="News feeds"
      description="Any RSS or Atom feed URL. Headlines from enabled feeds are merged by date."
      actions={
        <button
          className="btn small ghost"
          onClick={async () => {
            try {
              const r = await api.post<{ error: string | null }>('/api/data/news/refresh');
              if (r.error) toast(r.error, 'error');
              else toast('Headlines refreshed');
            } catch (err) {
              toastError(err);
            }
          }}
        >
          Refresh now
        </button>
      }
    >
      <ul className="edit-list">
        {feeds.map((f, i) => (
          <li key={`${f.url}-${i}`}>
            <Toggle checked={f.enabled} onChange={(enabled) => void save({ newsFeeds: feeds.map((x, j) => (j === i ? { ...x, enabled } : x)) })} />
            <CommitInput className="short" value={f.name} onCommit={(v) => v.trim() && void save({ newsFeeds: feeds.map((x, j) => (j === i ? { ...x, name: v } : x)) })} />
            <CommitInput className="grow" value={f.url} onCommit={(v) => void save({ newsFeeds: feeds.map((x, j) => (j === i ? { ...x, url: v } : x)) })} />
            <button className="icon-btn danger" title="Remove" onClick={() => void save({ newsFeeds: feeds.filter((_, j) => j !== i) })}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || !url.trim()) return;
          if (await save({ newsFeeds: [...feeds, { name: name.trim(), url: url.trim(), enabled: true }] })) {
            setName('');
            setUrl('');
          }
        }}
      >
        <input className="short" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="grow" placeholder="https://example.com/feed.xml" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn" disabled={!name.trim() || !url.trim()}>
          <Plus size={15} /> Add feed
        </button>
      </form>
      <div className="form-grid three">
        <label className="field">
          <span>Weather refresh (minutes)</span>
          <NumberInput value={settings.refresh.weatherMinutes} min={5} max={180} onCommit={(weatherMinutes) => void save({ refresh: { weatherMinutes } })} />
        </label>
        <label className="field">
          <span>News refresh (minutes)</span>
          <NumberInput value={settings.refresh.newsMinutes} min={5} max={180} onCommit={(newsMinutes) => void save({ refresh: { newsMinutes } })} />
        </label>
        <label className="field">
          <span>Calendar refresh (minutes)</span>
          <NumberInput value={settings.refresh.calendarMinutes} min={1} max={120} onCommit={(calendarMinutes) => void save({ refresh: { calendarMinutes } })} />
        </label>
      </div>
    </Section>
  );
}

function DisplaySection({ settings, save }: { settings: Settings; save: Save }) {
  const d = settings.display;
  return (
    <Section title="Display" description="Appearance of the TV display. Changes apply instantly.">
      <div className="form-grid">
        <label className="field">
          <span>
            Color theme · <Link to="/admin/themes">create or edit themes</Link>
          </span>
          <select value={d.theme} onChange={(e) => void save({ display: { theme: e.target.value } })}>
            <optgroup label="Built-in">
              {THEME_PRESETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            {settings.customThemes.length > 0 && (
              <optgroup label="Your themes">
                {settings.customThemes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <RangeField
          label="Text size"
          value={d.fontScale}
          min={0.6}
          max={1.8}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onCommit={(fontScale) => void save({ display: { fontScale } })}
        />
        <label className="field">
          <span>Screen transition</span>
          <select value={d.transition} onChange={(e) => void save({ display: { transition: e.target.value as 'fade' | 'none' } })}>
            <option value="fade">Fade</option>
            <option value="none">None (lightest on the Pi)</option>
          </select>
        </label>
        <div className="field">
          <span>Status bar</span>
          <Toggle checked={d.showStatusBar} onChange={(showStatusBar) => void save({ display: { showStatusBar } })} label="Show screen list and pin/pause status" />
        </div>
      </div>
      <h3>Night dimming</h3>
      <div className="form-grid four">
        <div className="field">
          <span>Enabled</span>
          <Toggle checked={d.dimEnabled} onChange={(dimEnabled) => void save({ display: { dimEnabled } })} />
        </div>
        <label className="field">
          <span>From</span>
          <input type="time" value={d.dimStart} onChange={(e) => e.target.value && void save({ display: { dimStart: e.target.value } })} />
        </label>
        <label className="field">
          <span>Until</span>
          <input type="time" value={d.dimEnd} onChange={(e) => e.target.value && void save({ display: { dimEnd: e.target.value } })} />
        </label>
        <RangeField
          label="Dim amount"
          value={d.dimLevel}
          min={0}
          max={0.95}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onCommit={(dimLevel) => void save({ display: { dimLevel } })}
        />
      </div>
    </Section>
  );
}

function StatusLine({ s }: { s: AdapterStatus }) {
  if (!s.enabled) return <span className="muted small">Disabled</span>;
  return (
    <span className="small">
      <span className={`badge ${s.running ? 'ok' : 'warn'}`}>{s.running ? 'Running' : 'Not running'}</span>
      {s.detail && <span className="muted"> {s.detail}</span>}
      {s.error && <span className="error-text"> {s.error}</span>}
      {s.lastInput && <span className="muted"> · last input: {s.lastInput}</span>}
    </span>
  );
}

function RemoteSection({ settings, save }: { settings: Settings; save: Save }) {
  const { data: status, reload } = useApi<InputStatus>('/api/system/input');
  useEffect(() => {
    const t = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(t);
  }, [reload]);
  const tv = settings.tvPower;

  async function tvPower(on: boolean) {
    try {
      await api.post('/api/system/tv', { on });
      toast(on ? 'TV on command sent' : 'TV standby command sent');
    } catch (err) {
      toastError(err);
    }
    void reload();
  }

  return (
    <>
      <Section
        title="Remote control"
        description="Keyboard-style remotes (USB RF dongles, Bluetooth) work with no setup. IR receivers and the TV's own remote (HDMI-CEC) need the adapters below."
      >
        <details className="help">
          <summary>Button mapping</summary>
          <table className="keymap">
            <tbody>
              <tr><td>Right / Left, Page Down / Up, next / previous track</td><td>Next / previous screen</td></tr>
              <tr><td>Up / Down</td><td>Scroll or page within a screen</td></tr>
              <tr><td>OK / Enter</td><td>Screen action (calendar view, next photo, next page)</td></tr>
              <tr><td>Back / Esc / Home</td><td>Go to the Home screen</td></tr>
              <tr><td>Play/Pause, Space</td><td>Pause or resume rotation</td></tr>
              <tr><td>P, Stop, red button</td><td>Pin / unpin the current screen</td></tr>
              <tr><td>1-9</td><td>Jump to that screen</td></tr>
              <tr><td>Menu / Info / I</td><td>Show what's on and whether it's pinned</td></tr>
            </tbody>
          </table>
        </details>
        <div className="adapter">
          <div className="adapter-head">
            <Toggle checked={settings.input.ir.enabled} onChange={(enabled) => void save({ input: { ir: { enabled } } })} label={<strong>IR receiver (gpio-ir)</strong>} />
            {status && <StatusLine s={status.ir} />}
          </div>
          <label className="field">
            <span>Input device (leave blank to auto-detect)</span>
            <CommitInput
              placeholder="/dev/input/by-path/platform-ir-receiver@12-event"
              value={settings.input.ir.devicePath}
              onCommit={(devicePath) => void save({ input: { ir: { devicePath } } })}
            />
          </label>
        </div>
        <div className="adapter">
          <div className="adapter-head">
            <Toggle checked={settings.input.cec.enabled} onChange={(enabled) => void save({ input: { cec: { enabled } } })} label={<strong>HDMI-CEC (TV remote)</strong>} />
            {status && <StatusLine s={status.cec} />}
          </div>
          <label className="field">
            <span>cec-client command</span>
            <CommitInput value={settings.input.cec.command} onCommit={(command) => void save({ input: { cec: { command } } })} />
          </label>
        </div>
      </Section>

      <Section title="TV power schedule" description="Turns the TV on and to standby over HDMI-CEC. Requires cec-utils on the Pi and CEC enabled on the TV.">
        <div className="form-grid four">
          <div className="field">
            <span>Enabled</span>
            <Toggle checked={tv.enabled} onChange={(enabled) => void save({ tvPower: { enabled } })} />
          </div>
          <label className="field">
            <span>Turn on at</span>
            <input type="time" value={tv.onTime} onChange={(e) => e.target.value && void save({ tvPower: { onTime: e.target.value } })} />
          </label>
          <label className="field">
            <span>Standby at</span>
            <input type="time" value={tv.offTime} onChange={(e) => e.target.value && void save({ tvPower: { offTime: e.target.value } })} />
          </label>
          <div className="field">
            <span>Days</span>
            <DayPicker days={tv.days} onChange={(days) => void save({ tvPower: { days } })} />
          </div>
        </div>
        <div className="button-row">
          <button className="btn" onClick={() => void tvPower(true)}>
            <Power size={15} /> TV on now
          </button>
          <button className="btn" onClick={() => void tvPower(false)}>
            <PowerOff size={15} /> TV standby now
          </button>
          {status?.tvPower.lastAction && <span className="muted small">Last: {status.tvPower.lastAction}</span>}
          {status?.tvPower.lastError && <span className="error-text small">{status.tvPower.lastError}</span>}
        </div>
      </Section>
    </>
  );
}

export function SettingsPage() {
  const { settings, save, error } = useSettings();
  if (error) return <div className="alert error">{error}</div>;
  if (!settings) return null;
  return (
    <>
      <PageHeader title="Settings" />
      <LocationSection settings={settings} save={save} />
      <DisplaySection settings={settings} save={save} />
      <WorldClocksSection settings={settings} save={save} />
      <NewsSection settings={settings} save={save} />
      <RemoteSection settings={settings} save={save} />
    </>
  );
}
