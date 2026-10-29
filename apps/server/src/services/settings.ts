import { EventEmitter } from 'node:events';
import { eq } from 'drizzle-orm';
import { defaultSettings, settingsSchema, type Settings } from '@officeboard/shared';
import type { Db } from '../db/index.js';
import { schema } from '../db/index.js';
import { decrypt, encrypt } from '../lib/crypto.js';

const SETTINGS_KEY = 'app';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Objects merge recursively; arrays and primitives in the patch replace the base value. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export interface SettingsEvents {
  change: [next: Settings, prev: Settings];
}

export class SettingsService extends EventEmitter<SettingsEvents> {
  private current: Settings;

  constructor(private db: Db) {
    super();
    const raw = this.getRaw(SETTINGS_KEY);
    let parsed: Settings;
    try {
      parsed = raw ? settingsSchema.parse(JSON.parse(raw)) : defaultSettings();
    } catch {
      parsed = defaultSettings();
    }
    this.current = parsed;
    this.setRaw(SETTINGS_KEY, JSON.stringify(parsed));
  }

  get(): Settings {
    return this.current;
  }

  /** Deep-merges and validates a partial update. Throws a ZodError on invalid input. */
  update(patch: unknown): Settings {
    const prev = this.current;
    const next = settingsSchema.parse(deepMerge(prev, patch));
    this.current = next;
    this.setRaw(SETTINGS_KEY, JSON.stringify(next));
    this.emit('change', next, prev);
    return next;
  }

  getRaw(key: string): string | null {
    const row = this.db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    return row?.value ?? null;
  }

  setRaw(key: string, value: string | null): void {
    if (value === null) {
      this.db.delete(schema.settings).where(eq(schema.settings.key, key)).run();
      return;
    }
    this.db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
      .run();
  }

  getSecret(key: string): string | null {
    const raw = this.getRaw(`secret:${key}`);
    if (!raw) return null;
    try {
      return decrypt(raw);
    } catch {
      return null;
    }
  }

  setSecret(key: string, value: string | null): void {
    this.setRaw(`secret:${key}`, value === null ? null : encrypt(value));
  }
}
