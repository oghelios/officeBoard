import { z } from 'zod';

export const PROJECT_STATUSES = ['active', 'on_hold', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  archived: 'Archived',
};

export interface Project {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
  dueDate: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Todo {
  id: number;
  projectId: number;
  text: string;
  done: boolean;
  sortOrder: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ProjectWithTodos extends Project {
  todos: Todo[];
}

export interface Reminder {
  id: number;
  title: string;
  notes: string;
  /** ISO timestamp, or YYYY-MM-DD when allDay is true. Null means "no date". */
  dueAt: string | null;
  allDay: boolean;
  done: boolean;
  createdAt: string;
}

export interface Photo {
  id: number;
  filename: string;
  originalName: string;
  caption: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex color like #3b82f6');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(''),
  status: z.enum(PROJECT_STATUSES).default('active'),
  color: hexColor.default('#3b82f6'),
  dueDate: isoDate.nullable().default(null),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;
export const projectPatchSchema = projectInputSchema.partial();

export const todoInputSchema = z.object({
  text: z.string().trim().min(1).max(500),
  done: z.boolean().default(false),
});
export const todoPatchSchema = todoInputSchema.partial();

export const reminderInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(2000).default(''),
  dueAt: z.string().nullable().default(null),
  allDay: z.boolean().default(false),
  done: z.boolean().default(false),
});
export const reminderPatchSchema = reminderInputSchema.partial();

export const reorderSchema = z.object({
  ids: z.array(z.number().int()).min(1),
});

export const PROJECT_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#14b8a6',
  '#ec4899',
  '#64748b',
  '#a3a3a3',
  '#e5e5e5',
];
