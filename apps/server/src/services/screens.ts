import { EventEmitter } from 'node:events';
import { asc, eq } from 'drizzle-orm';
import {
  SCREEN_TYPE_INFO,
  SCREEN_TYPES,
  normalizeScreenConfig,
  screenInputSchema,
  screenPatchSchema,
  type ScreenInstance,
  type ScreenType,
} from '@officeboard/shared';
import type { Db } from '../db/index.js';
import { schema } from '../db/index.js';
import { randomToken } from '../lib/crypto.js';

const SEED_ORDER: ScreenType[] = ['home', 'projects', 'calendar', 'forecast', 'clock', 'photos', 'system'];
// Photos start disabled because the library is empty on a fresh install.
const SEED_DISABLED = new Set<ScreenType>(['photos']);

type Row = typeof schema.screens.$inferSelect;

function toInstance(row: Row): ScreenInstance {
  const type = (SCREEN_TYPES as readonly string[]).includes(row.type) ? (row.type as ScreenType) : 'clock';
  let config: unknown = {};
  try {
    config = JSON.parse(row.config);
  } catch {
    /* fall back to defaults */
  }
  return {
    id: row.id,
    type,
    name: row.name,
    enabled: row.enabled,
    durationSec: row.durationSec,
    sortOrder: row.sortOrder,
    config: normalizeScreenConfig(type, config),
  };
}

export class ScreensService extends EventEmitter<{ change: [] }> {
  constructor(private db: Db) {
    super();
    this.seed();
  }

  private seed(): void {
    const existing = this.db.select({ id: schema.screens.id }).from(schema.screens).all();
    if (existing.length > 0) return;
    SEED_ORDER.forEach((type, i) => {
      const info = SCREEN_TYPE_INFO[type];
      this.db
        .insert(schema.screens)
        .values({
          id: type,
          type,
          name: info.label,
          enabled: !SEED_DISABLED.has(type),
          durationSec: info.defaultDurationSec,
          sortOrder: i,
          config: '{}',
        })
        .run();
    });
  }

  list(): ScreenInstance[] {
    return this.db
      .select()
      .from(schema.screens)
      .orderBy(asc(schema.screens.sortOrder), asc(schema.screens.id))
      .all()
      .map(toInstance);
  }

  get(id: string): ScreenInstance | null {
    const row = this.db.select().from(schema.screens).where(eq(schema.screens.id, id)).get();
    return row ? toInstance(row) : null;
  }

  create(input: unknown): ScreenInstance {
    const data = screenInputSchema.parse(input);
    const id = `${data.type}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const maxOrder = Math.max(-1, ...this.list().map((s) => s.sortOrder));
    this.db
      .insert(schema.screens)
      .values({
        id,
        type: data.type,
        name: data.name,
        enabled: data.enabled,
        durationSec: data.durationSec ?? SCREEN_TYPE_INFO[data.type].defaultDurationSec,
        sortOrder: maxOrder + 1,
        config: JSON.stringify(normalizeScreenConfig(data.type, data.config)),
      })
      .run();
    this.emit('change');
    return this.get(id)!;
  }

  update(id: string, input: unknown): ScreenInstance | null {
    const existing = this.get(id);
    if (!existing) return null;
    const patch = screenPatchSchema.parse(input);
    this.db
      .update(schema.screens)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.enabled !== undefined && { enabled: patch.enabled }),
        ...(patch.durationSec !== undefined && { durationSec: patch.durationSec }),
        ...(patch.config !== undefined && {
          config: JSON.stringify(normalizeScreenConfig(existing.type, { ...existing.config, ...patch.config })),
        }),
      })
      .where(eq(schema.screens.id, id))
      .run();
    this.emit('change');
    return this.get(id);
  }

  remove(id: string): boolean {
    const result = this.db.delete(schema.screens).where(eq(schema.screens.id, id)).run();
    if (result.changes > 0) this.emit('change');
    return result.changes > 0;
  }

  reorder(ids: string[]): void {
    this.db.transaction((tx) => {
      ids.forEach((id, i) => {
        tx.update(schema.screens).set({ sortOrder: i }).where(eq(schema.screens.id, id)).run();
      });
    });
    this.emit('change');
  }
}
