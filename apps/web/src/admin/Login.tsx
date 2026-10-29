import { useState, type FormEvent } from 'react';
import { api, type AuthStatus } from '../lib/api';

export function Login({ status, onDone }: { status: AuthStatus; onDone: () => void }) {
  const setup = status.setupRequired;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (setup) {
      if (password.length < status.minPasswordLength) {
        setError(`Use at least ${status.minPasswordLength} characters`);
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match');
        return;
      }
    }
    setBusy(true);
    try {
      await api.post(setup ? '/api/auth/setup' : '/api/auth/login', { password });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const blockedSetup = setup && !status.isLan;

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src="/favicon.svg" alt="" width={40} height={40} />
          <h1>Office Board</h1>
        </div>
        {blockedSetup ? (
          <p className="muted">
            No admin password has been created yet. For security, first-time setup has to be done
            from a device on the same network as the board.
          </p>
        ) : (
          <>
            <p className="muted">
              {setup ? 'Create an admin password to manage the board.' : 'Sign in to manage the board.'}
            </p>
            <label className="field">
              <span>{setup ? 'New password' : 'Password'}</span>
              <input
                type="password"
                autoFocus
                autoComplete={setup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {setup && (
              <label className="field">
                <span>Confirm password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}
            {error && <div className="alert error">{error}</div>}
            <button className="btn primary block" disabled={busy || !password}>
              {busy ? 'Please wait...' : setup ? 'Create password' : 'Sign in'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
