import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const sessions = sqliteTable('sessions', {
  /** SHA-256 of the session token; the raw token only lives in the cookie. */
  id: text('id').primaryKey(),
  createdAt: createdAt(),
  expiresAt: text('expires_at').notNull(),
  userAgent: text('user_agent').notNull().default(''),
});

export const screens = sqliteTable('screens', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  durationSec: integer('duration_sec').notNull().default(30),
  sortOrder: integer('sort_order').notNull().default(0),
  config: text('config').notNull().default('{}'),
});

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('active'),
  color: text('color').notNull().default('#3b82f6'),
  dueDate: text('due_date'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: createdAt(),
});

export const todos = sqliteTable(
  'todos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    completedAt: text('completed_at'),
  },
  (t) => [index('todos_project_idx').on(t.projectId)],
);

export const reminders = sqliteTable('reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  notes: text('notes').notNull().default(''),
  dueAt: text('due_at'),
  allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
});

export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull().default(''),
  caption: text('caption').notNull().default(''),
  width: integer('width'),
  height: integer('height'),
  createdAt: createdAt(),
});
