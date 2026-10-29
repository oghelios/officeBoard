import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, lt } from 'drizzle-orm';
import { config } from '../config.js';
import type { Db } from '../db/index.js';
import { schema } from '../db/index.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { badRequest } from '../lib/errors.js';
import type { SettingsService } from './settings.js';

const PASSWORD_KEY = 'adminPasswordHash';
export const MIN_PASSWORD_LENGTH = 8;

export class AuthService {
  constructor(
    private db: Db,
    private settings: SettingsService,
  ) {}

  hasPassword(): boolean {
    return Boolean(this.settings.getRaw(PASSWORD_KEY));
  }

  async setPassword(password: string): Promise<void> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    this.settings.setRaw(PASSWORD_KEY, await hash(password));
  }

  async verifyPassword(password: string): Promise<boolean> {
    const stored = this.settings.getRaw(PASSWORD_KEY);
    if (!stored) return false;
    try {
      return await verify(stored, password);
    } catch {
      return false;
    }
  }

  createSession(userAgent: string): { token: string; expiresAt: Date } {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86400_000);
    this.db
      .insert(schema.sessions)
      .values({ id: sha256(token), expiresAt: expiresAt.toISOString(), userAgent: userAgent.slice(0, 200) })
      .run();
    return { token, expiresAt };
  }

  validateSession(token: string | undefined): boolean {
    if (!token) return false;
    const row = this.db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date().toISOString())))
      .get();
    return Boolean(row);
  }

  deleteSession(token: string): void {
    this.db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token))).run();
  }

  deleteAllSessions(): void {
    this.db.delete(schema.sessions).run();
  }

  purgeExpired(): void {
    this.db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date().toISOString())).run();
  }
}
