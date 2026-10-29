import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Link as LinkIcon, RefreshCw, Unlink } from 'lucide-react';
import { api } from '../../lib/api';
import { PageHeader, Section, toast, toastError, useApi } from '../components/ui';

interface GoogleStatus {
  clientId: string;
  clientSecretSet: boolean;
  connected: boolean;
  redirectUri: string;
  publicUrl: string;
  calendarIds: string[];
}

interface CalendarItem {
  id: string;
  name: string;
  color: string;
  primary: boolean;
}

function CalendarPicker({ selected, onSaved }: { selected: string[]; onSaved: () => void }) {
  const { data: calendars, error, reload, loading } = useApi<CalendarItem[]>('/api/google/calendars');
  // null = no unsaved edits; the server falls back to the primary calendar when nothing is saved.
  const [draft, setDraft] = useState<string[] | null>(null);
  const saved = selected.length ? selected : (calendars ?? []).filter((c) => c.primary).map((c) => c.id);
  const effective = draft ?? saved;
  const setIds = (ids: string[]) => setDraft(ids);
  const dirty = draft !== null;

  async function save() {
    try {
      await api.put('/api/google/calendars', { ids: effective });
      toast('Calendar selection saved');
      setDraft(null);
      onSaved();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="calendar-picker">
      <div className="section-head">
        <h3>Calendars to show</h3>
        <button className="btn small ghost" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={14} /> Refresh list
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}
      <ul className="check-list">
        {calendars?.map((c) => (
          <li key={c.id}>
            <label>
              <input
                type="checkbox"
                checked={effective.includes(c.id)}
                onChange={(e) =>
                  setIds(e.target.checked ? [...effective, c.id] : effective.filter((x) => x !== c.id))
                }
              />
              <span className="swatch-dot" style={{ background: c.color }} />
              {c.name}
              {c.primary && <span className="badge">Primary</span>}
            </label>
          </li>
        ))}
      </ul>
      <button className="btn primary" onClick={() => void save()} disabled={!dirty}>
        Save selection
      </button>
    </div>
  );
}

export function IntegrationsPage() {
  const { data: status, reload } = useApi<GoogleStatus>('/api/google/status');
  const [params, setParams] = useSearchParams();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [publicUrl, setPublicUrl] = useState('');

  useEffect(() => {
    if (!status) return;
    setClientId(status.clientId);
    setPublicUrl(status.publicUrl);
  }, [status]);

  useEffect(() => {
    const result = params.get('google');
    if (!result) return;
    if (result === 'connected') toast('Google Calendar connected');
    else toast(`Google sign-in failed: ${result}`, 'error');
    params.delete('google');
    setParams(params, { replace: true });
  }, [params, setParams]);

  async function saveCredentials() {
    try {
      await api.put('/api/google/credentials', { clientId, clientSecret: clientSecret || undefined, publicUrl });
      setClientSecret('');
      toast('Google credentials saved');
      await reload();
    } catch (err) {
      toastError(err);
    }
  }

  async function connect() {
    try {
      const { url } = await api.get<{ url: string }>('/api/google/auth-url');
      window.location.assign(url);
    } catch (err) {
      toastError(err);
    }
  }

  async function disconnect() {
    try {
      await api.post('/api/google/disconnect');
      toast('Disconnected from Google');
      await reload();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <>
      <PageHeader title="Integrations" subtitle="Connect external services. Weather (Open-Meteo) and news (RSS) need no setup." />
      <Section
        title="Google Calendar"
        description="Read-only access to the calendars you pick. Events refresh every few minutes."
        actions={
          status && (
            <span className={`badge ${status.connected ? 'ok' : ''}`}>{status.connected ? 'Connected' : 'Not connected'}</span>
          )
        }
      >
        {status && (
          <>
            <details className="help" open={!status.clientId}>
              <summary>How to create Google OAuth credentials</summary>
              <ol>
                <li>
                  Open the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud console</a>,
                  create a project, and enable the <strong>Google Calendar API</strong>.
                </li>
                <li>
                  Configure the OAuth consent screen (External, add yourself as a test user) or publish it so the
                  refresh token doesn't expire after 7 days.
                </li>
                <li>
                  Create an <strong>OAuth client ID</strong> of type <strong>Web application</strong> and add the
                  redirect URI shown below.
                </li>
                <li>Paste the client ID and secret here, save, then click Connect.</li>
              </ol>
              <p className="muted small">
                Google only accepts <code>http://localhost</code> or HTTPS redirect URIs. Either connect from a
                browser on the Pi itself, or set the public URL to your Cloudflare Tunnel hostname.
              </p>
            </details>

            <div className="form-grid">
              <label className="field">
                <span>Client ID</span>
                <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234-abc.apps.googleusercontent.com" />
              </label>
              <label className="field">
                <span>Client secret {status.clientSecretSet && <em className="muted">(saved; leave blank to keep)</em>}</span>
                <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={status.clientSecretSet ? '********' : ''} />
              </label>
              <label className="field">
                <span>Public URL (optional)</span>
                <input value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://board.example.com" />
              </label>
              <div className="field">
                <span>Redirect URI to register with Google</span>
                <div className="copy-row">
                  <code>{status.redirectUri}</code>
                  <button
                    className="icon-btn"
                    title="Copy"
                    onClick={() => void navigator.clipboard?.writeText(status.redirectUri).then(() => toast('Copied'))}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            </div>
            <div className="button-row">
              <button className="btn" onClick={() => void saveCredentials()}>
                Save credentials
              </button>
              {status.connected ? (
                <button className="btn danger" onClick={() => void disconnect()}>
                  <Unlink size={16} /> Disconnect
                </button>
              ) : (
                <button className="btn primary" disabled={!status.clientId || !status.clientSecretSet} onClick={() => void connect()}>
                  <LinkIcon size={16} /> Connect Google account
                </button>
              )}
            </div>

            {status.connected && <CalendarPicker selected={status.calendarIds} onSaved={() => void reload()} />}
          </>
        )}
      </Section>
    </>
  );
}
