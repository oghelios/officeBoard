import { EventEmitter } from 'node:events';
import { asc, eq, sql } from 'drizzle-orm';
import { reminderInputSchema, reminderPatchSchema, type Reminder } from '@officeboard/shared';
import type { Db } from '../db/index.js';
import { schema } from '../db/index.js';
import { badRequest } from '../lib/errors.js';

function normalizeDue(dueAt: string | null | undefined, allDay: boolean): string | null | undefined {
  if (dueAt === undefined) return undefined;
  if (dueAt === null || dueAt === '') return null;
  if (allDay) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(dueAt);
    if (!m) throw badRequest('All-day reminders need a YYYY-MM-DD date');
    return m[1];
  }
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) throw badRequest('Invalid reminder date');
  return d.toISOString();
}

export class RemindersService extends EventEmitter<{ change: [] }> {
  constructor(private db: Db) {
    super();
  }

  list(): Reminder[] {
    // Undated reminders sort last.
    return this.db
      .select()
      .from(schema.reminders)
      .orderBy(asc(schema.reminders.done), sql`${schema.reminders.dueAt} is null`, asc(schema.reminders.dueAt), asc(schema.reminders.id))
      .all();
  }

  create(input: unknown): Reminder {
    const data = reminderInputSchema.parse(input);
    const row = this.db
      .insert(schema.reminders)
      .values({
        ...data,
        dueAt: normalizeDue(data.dueAt, data.allDay) ?? null,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();
    this.emit('change');
    return row;
  }

  update(id: number, input: unknown): Reminder | null {
    const existing = this.db.select().from(schema.reminders).where(eq(schema.reminders.id, id)).get();
    if (!existing) return null;
    const patch = reminderPatchSchema.parse(input);
    const allDay = patch.allDay ?? existing.allDay;
    const dueAt = patch.dueAt !== undefined || patch.allDay !== undefined
      ? normalizeDue(patch.dueAt !== undefined ? patch.dueAt : existing.dueAt, allDay)
      : undefined;
    const row = this.db
      .update(schema.reminders)
      .set({ ...patch, ...(dueAt !== undefined && { dueAt }) })
      .where(eq(schema.reminders.id, id))
      .returning()
      .get();
    this.emit('change');
    return row;
  }

  remove(id: number): boolean {
    const res = this.db.delete(schema.reminders).where(eq(schema.reminders.id, id)).run();
    if (res.changes > 0) this.emit('change');
    return res.changes > 0;
  }

  clearDone(): number {
    const res = this.db.delete(schema.reminders).where(eq(schema.reminders.done, true)).run();
    if (res.changes > 0) this.emit('change');
    return res.changes;
  }
}
