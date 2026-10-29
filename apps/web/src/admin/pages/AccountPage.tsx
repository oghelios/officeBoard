import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { PageHeader } from '../components/ui';

export function AccountPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setMessage({ kind: 'error', text: 'New passwords do not match' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.post('/api/auth/password', { current, next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setMessage({ kind: 'ok', text: 'Password changed. Other devices have been signed out.' });
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Account" subtitle="Change the admin password." />
      <form className="card narrow" onSubmit={submit}>
        <label className="field">
          <span>Current password</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="field">
          <span>New password</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {message && <div className={`alert ${message.kind === 'ok' ? 'success' : 'error'}`}>{message.text}</div>}
        <button className="btn primary" disabled={busy || !current || !next}>
          Change password
        </button>
        <p className="muted small">
          Forgot the password? On the Pi, run <code>pnpm --filter @officeboard/server set-password</code>.
        </p>
      </form>
    </>
  );
}
