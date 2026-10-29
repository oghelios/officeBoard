import { EventEmitter } from 'node:events';
import { asc, eq, sql } from 'drizzle-orm';
import {
  projectInputSchema,
  projectPatchSchema,
  todoInputSchema,
  todoPatchSchema,
  type Project,
  type ProjectStatus,
  type ProjectWithTodos,
  type Todo,
} from '@officeboard/shared';
import type { Db } from '../db/index.js';
import { schema } from '../db/index.js';

const now = () => new Date().toISOString();

function toProject(row: typeof schema.projects.$inferSelect): Project {
  return { ...row, status: row.status as ProjectStatus };
}

export class ProjectsService extends EventEmitter<{ change: [] }> {
  constructor(private db: Db) {
    super();
  }

  listWithTodos(): ProjectWithTodos[] {
    const projects = this.db
      .select()
      .from(schema.projects)
      .orderBy(asc(schema.projects.sortOrder), asc(schema.projects.id))
      .all();
    const todos = this.db
      .select()
      .from(schema.todos)
      .orderBy(asc(schema.todos.sortOrder), asc(schema.todos.id))
      .all();
    const byProject = new Map<number, Todo[]>();
    for (const t of todos) {
      const list = byProject.get(t.projectId) ?? [];
      list.push(t);
      byProject.set(t.projectId, list);
    }
    return projects.map((p) => ({ ...toProject(p), todos: byProject.get(p.id) ?? [] }));
  }

  getProject(id: number): ProjectWithTodos | null {
    return this.listWithTodos().find((p) => p.id === id) ?? null;
  }

  createProject(input: unknown): ProjectWithTodos {
    const data = projectInputSchema.parse(input);
    const maxOrder = this.db
      .select({ max: sql<number>`coalesce(max(${schema.projects.sortOrder}), -1)` })
      .from(schema.projects)
      .get()!.max;
    const row = this.db
      .insert(schema.projects)
      .values({ ...data, sortOrder: maxOrder + 1, createdAt: now(), updatedAt: now() })
      .returning()
      .get();
    this.emit('change');
    return { ...toProject(row), todos: [] };
  }

  updateProject(id: number, input: unknown): ProjectWithTodos | null {
    const patch = projectPatchSchema.parse(input);
    const res = this.db
      .update(schema.projects)
      .set({ ...patch, updatedAt: now() })
      .where(eq(schema.projects.id, id))
      .run();
    if (res.changes === 0) return null;
    this.emit('change');
    return this.getProject(id);
  }

  deleteProject(id: number): boolean {
    const res = this.db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
    if (res.changes > 0) this.emit('change');
    return res.changes > 0;
  }

  reorderProjects(ids: number[]): void {
    this.db.transaction((tx) => {
      ids.forEach((id, i) =>
        tx.update(schema.projects).set({ sortOrder: i }).where(eq(schema.projects.id, id)).run(),
      );
    });
    this.emit('change');
  }

  private touch(projectId: number): void {
    this.db.update(schema.projects).set({ updatedAt: now() }).where(eq(schema.projects.id, projectId)).run();
  }

  createTodo(projectId: number, input: unknown): Todo | null {
    const exists = this.db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.id, projectId)).get();
    if (!exists) return null;
    const data = todoInputSchema.parse(input);
    const maxOrder = this.db
      .select({ max: sql<number>`coalesce(max(${schema.todos.sortOrder}), -1)` })
      .from(schema.todos)
      .where(eq(schema.todos.projectId, projectId))
      .get()!.max;
    const row = this.db
      .insert(schema.todos)
      .values({
        projectId,
        text: data.text,
        done: data.done,
        sortOrder: maxOrder + 1,
        createdAt: now(),
        completedAt: data.done ? now() : null,
      })
      .returning()
      .get();
    this.touch(projectId);
    this.emit('change');
    return row;
  }

  updateTodo(id: number, input: unknown): Todo | null {
    const patch = todoPatchSchema.parse(input);
    const existing = this.db.select().from(schema.todos).where(eq(schema.todos.id, id)).get();
    if (!existing) return null;
    const completedAt =
      patch.done === undefined ? existing.completedAt : patch.done ? (existing.completedAt ?? now()) : null;
    const row = this.db
      .update(schema.todos)
      .set({ ...patch, completedAt })
      .where(eq(schema.todos.id, id))
      .returning()
      .get();
    this.touch(existing.projectId);
    this.emit('change');
    return row;
  }

  deleteTodo(id: number): boolean {
    const existing = this.db.select().from(schema.todos).where(eq(schema.todos.id, id)).get();
    if (!existing) return false;
    this.db.delete(schema.todos).where(eq(schema.todos.id, id)).run();
    this.touch(existing.projectId);
    this.emit('change');
    return true;
  }

  reorderTodos(projectId: number, ids: number[]): void {
    this.db.transaction((tx) => {
      ids.forEach((id, i) =>
        tx
          .update(schema.todos)
          .set({ sortOrder: i })
          .where(sql`${schema.todos.id} = ${id} and ${schema.todos.projectId} = ${projectId}`)
          .run(),
      );
    });
    this.emit('change');
  }
}
