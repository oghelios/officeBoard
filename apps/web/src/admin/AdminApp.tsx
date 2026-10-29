import { useCallback, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  FolderKanban,
  Image,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  Palette,
  Plug,
  Settings as SettingsIcon,
} from 'lucide-react';
import { api, type AuthStatus } from '../lib/api';
import { Login } from './Login';
import { Toaster } from './components/ui';
import { AccountPage } from './pages/AccountPage';
import { DashboardPage } from './pages/DashboardPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { PhotosPage } from './pages/PhotosPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { RemindersPage } from './pages/RemindersPage';
import { ScreensPage } from './pages/ScreensPage';
import { SettingsPage } from './pages/SettingsPage';
import { ThemesPage } from './pages/ThemesPage';
import './admin.css';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/screens', label: 'Screens', icon: MonitorPlay },
  { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { to: '/admin/reminders', label: 'Reminders', icon: CalendarClock },
  { to: '/admin/photos', label: 'Photos', icon: Image },
  { to: '/admin/themes', label: 'Themes', icon: Palette },
  { to: '/admin/integrations', label: 'Integrations', icon: Plug },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/admin/account', label: 'Account', icon: KeyRound },
];

/** Already signed in but sent to the login URL: continue to wherever `next` points. */
function LoginRedirect() {
  const next = new URLSearchParams(useLocation().search).get('next');
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
  useEffect(() => {
    if (!safe.startsWith('/admin')) window.location.assign(safe);
  }, [safe]);
  return safe.startsWith('/admin') ? <Navigate to={safe} replace /> : null;
}

export default function AdminApp() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.get<AuthStatus>('/api/auth/status'));
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    document.title = 'Office Board Admin';
    void refresh();
    const onUnauthorized = () => void refresh();
    window.addEventListener('ob:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ob:unauthorized', onUnauthorized);
  }, [refresh]);

  if (loadError) {
    return (
      <div className="login-page">
        <div className="card login-card">
          <h1>Can't reach the board</h1>
          <p className="muted">{loadError}</p>
          <button className="btn" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!status) return null;

  if (!status.authenticated) {
    return (
      <Login
        status={status}
        onDone={async () => {
          await refresh();
          const next = new URLSearchParams(location.search).get('next');
          if (next && next.startsWith('/') && !next.startsWith('//')) {
            if (next.startsWith('/admin')) navigate(next, { replace: true });
            else window.location.assign(next);
          } else if (location.pathname === '/admin/login') {
            navigate('/admin', { replace: true });
          }
        }}
      />
    );
  }

  async function logout() {
    await api.post('/api/auth/logout').catch(() => undefined);
    await refresh();
  }

  return (
    <div className="admin">
      <aside className="sidebar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Office Board</span>
        </div>
        <nav>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <a href="/display" target="_blank" rel="noreferrer" className="btn ghost small">
            Open display
          </a>
          <button className="btn ghost small" onClick={() => void logout()}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <Toaster />
      <main className="content">
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="login" element={<LoginRedirect />} />
          <Route path="screens" element={<ScreensPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="reminders" element={<RemindersPage />} />
          <Route path="photos" element={<PhotosPage />} />
          <Route path="themes" element={<ThemesPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
