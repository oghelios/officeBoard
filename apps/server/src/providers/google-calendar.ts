import type { CalendarData, CalendarEvent } from '@officeboard/shared';
import { randomToken } from '../lib/crypto.js';
import { HttpError } from '../lib/errors.js';
import { fetchWithTimeout } from '../lib/http.js';
import type { SettingsService } from '../services/settings.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

const SECRET_KEY = 'google.clientSecret';
const TOKENS_KEY = 'google.tokens';
const STATE_TTL_MS = 10 * 60_000;

interface StoredTokens {
  refreshToken: string;
  accessToken: string | null;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole: string;
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export interface CalendarListItem {
  id: string;
  name: string;
  color: string;
  primary: boolean;
}

export class GoogleCalendarService {
  private pendingStates = new Map<string, { redirectUri: string; createdAt: number }>();
  private calendarCache: { at: number; items: CalendarListItem[] } | null = null;

  constructor(private settings: SettingsService) {}

  hasClientSecret(): boolean {
    return Boolean(this.settings.getSecret(SECRET_KEY));
  }

  setCredentials(clientId: string, clientSecret: string | undefined): void {
    const prevId = this.settings.get().google.clientId;
    this.settings.update({ google: { clientId } });
    if (!clientId) {
      this.settings.setSecret(SECRET_KEY, null);
      this.settings.setSecret(TOKENS_KEY, null);
      this.calendarCache = null;
      return;
    }
    if (clientSecret) this.settings.setSecret(SECRET_KEY, clientSecret);
    // Tokens are bound to the OAuth client that issued them.
    if (prevId && prevId !== clientId) this.settings.setSecret(TOKENS_KEY, null);
  }

  isConnected(): boolean {
    return this.tokens() !== null;
  }

  private tokens(): StoredTokens | null {
    const raw = this.settings.getSecret(TOKENS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredTokens;
    } catch {
      return null;
    }
  }

  private saveTokens(tokens: StoredTokens | null): void {
    this.settings.setSecret(TOKENS_KEY, tokens ? JSON.stringify(tokens) : null);
  }

  redirectUri(requestOrigin: string): string {
    const base = this.settings.get().google.publicUrl.trim().replace(/\/+$/, '') || requestOrigin;
    return `${base}/api/google/callback`;
  }

  createAuthUrl(redirectUri: string): string {
    const { clientId } = this.settings.get().google;
    if (!clientId || !this.hasClientSecret()) {
      throw new HttpError(400, 'Enter your Google OAuth client ID and secret first');
    }
    const now = Date.now();
    for (const [k, v] of this.pendingStates) {
      if (now - v.createdAt > STATE_TTL_MS) this.pendingStates.delete(k);
    }
    const state = randomToken(16);
    this.pendingStates.set(state, { redirectUri, createdAt: now });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH_URL}?${params}`;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!pending || Date.now() - pending.createdAt > STATE_TTL_MS) {
      throw new HttpError(400, 'Sign-in link expired; please try connecting again');
    }
    const res = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
    });
    if (!res.refresh_token) {
      throw new HttpError(400, 'Google did not return a refresh token; remove the app from your Google account permissions and reconnect');
    }
    this.saveTokens({
      refreshToken: res.refresh_token,
      accessToken: res.access_token,
      expiresAt: Date.now() + res.expires_in * 1000,
    });
    this.calendarCache = null;
  }

  async disconnect(): Promise<void> {
    const tokens = this.tokens();
    this.saveTokens(null);
    this.calendarCache = null;
    if (tokens) {
      await fetchWithTimeout(`${REVOKE_URL}?token=${encodeURIComponent(tokens.refreshToken)}`, {
        method: 'POST',
        timeoutMs: 8000,
      }).catch(() => undefined);
    }
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
    const clientSecret = this.settings.getSecret(SECRET_KEY);
    const { clientId } = this.settings.get().google;
    if (!clientId || !clientSecret) throw new HttpError(400, 'Google OAuth client is not configured');
    const res = await fetchWithTimeout(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }),
    });
    const body = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || body.error) {
      if (body.error === 'invalid_grant' && params.grant_type === 'refresh_token') {
        this.saveTokens(null);
        throw new HttpError(401, 'Google access was revoked or expired; reconnect in the admin panel');
      }
      throw new HttpError(502, `Google token error: ${body.error_description ?? body.error ?? res.status}`);
    }
    return body;
  }

  private async accessToken(): Promise<string> {
    const tokens = this.tokens();
    if (!tokens) throw new HttpError(400, 'Google Calendar is not connected');
    if (tokens.accessToken && tokens.expiresAt - 60_000 > Date.now()) return tokens.accessToken;
    const res = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken });
    const next: StoredTokens = {
      refreshToken: res.refresh_token ?? tokens.refreshToken,
      accessToken: res.access_token,
      expiresAt: Date.now() + res.expires_in * 1000,
    };
    this.saveTokens(next);
    return next.accessToken!;
  }

  private async api<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const token = await this.accessToken();
    const qs = new URLSearchParams(query).toString();
    const res = await fetchWithTimeout(`${API}${path}${qs ? `?${qs}` : ''}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new HttpError(502, `Google Calendar API ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async listCalendars(force = false): Promise<CalendarListItem[]> {
    if (!force && this.calendarCache && Date.now() - this.calendarCache.at < 10 * 60_000) {
      return this.calendarCache.items;
    }
    const items: CalendarListItem[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.api<{ items?: GoogleCalendarListEntry[]; nextPageToken?: string }>(
        '/users/me/calendarList',
        { maxResults: '250', ...(pageToken && { pageToken }) },
      );
      for (const c of page.items ?? []) {
        items.push({
          id: c.id,
          name: c.summaryOverride ?? c.summary,
          color: c.backgroundColor ?? '#3b82f6',
          primary: Boolean(c.primary),
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    this.calendarCache = { at: Date.now(), items };
    return items;
  }

  /** Events from roughly a week before this month through two months ahead. */
  async fetchData(): Promise<CalendarData> {
    if (!this.isConnected()) return { connected: false, calendars: [], events: [] };

    const all = await this.listCalendars();
    const selectedIds = this.settings.get().google.calendarIds;
    const selected = selectedIds.length
      ? all.filter((c) => selectedIds.includes(c.id))
      : all.filter((c) => c.primary);

    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), 1);
    timeMin.setDate(timeMin.getDate() - 7);
    const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    timeMax.setDate(timeMax.getDate() + 7);

    const events: CalendarEvent[] = [];
    await Promise.all(
      selected.map(async (cal) => {
        let pageToken: string | undefined;
        do {
          const page = await this.api<{ items?: GoogleEvent[]; nextPageToken?: string }>(
            `/calendars/${encodeURIComponent(cal.id)}/events`,
            {
              singleEvents: 'true',
              orderBy: 'startTime',
              timeMin: timeMin.toISOString(),
              timeMax: timeMax.toISOString(),
              maxResults: '250',
              ...(pageToken && { pageToken }),
            },
          );
          for (const e of page.items ?? []) {
            if (e.status === 'cancelled' || !e.start) continue;
            const allDay = Boolean(e.start.date);
            events.push({
              id: `${cal.id}:${e.id}`,
              calendarId: cal.id,
              title: e.summary ?? '(No title)',
              start: (allDay ? e.start.date : e.start.dateTime) ?? '',
              end: (allDay ? e.end?.date : e.end?.dateTime) ?? '',
              allDay,
              location: e.location ?? null,
              color: cal.color,
            });
          }
          pageToken = page.nextPageToken;
        } while (pageToken);
      }),
    );

    const sortKey = (e: CalendarEvent) => (e.allDay ? `${e.start}T00:00:00` : new Date(e.start).toISOString());
    events.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    return {
      connected: true,
      calendars: selected.map(({ id, name, color }) => ({ id, name, color })),
      events,
    };
  }
}
