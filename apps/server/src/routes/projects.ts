import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reorderSchema } from '@officeboard/shared';
import type { AppContext } from '../context.js';
import { notFound } from '../lib/errors.js';

const idParams = z.object({ id: z.coerce.number().int().positive() });

export async function projectsRoutes(app: FastifyInstance, { ctx }: { ctx: AppContext }) {
  const { projects } = ctx;

  app.get('/api/projects', async () => projects.listWithTodos());

  app.post('/api/projects', async (req, reply) => {
    reply.code(201);
    return projects.createProject(req.body);
  });

  app.patch('/api/projects/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const updated = projects.updateProject(id, req.body);
    if (!updated) throw notFound('Project not found');
    return updated;
  });

  app.delete('/api/projects/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    if (!projects.deleteProject(id)) throw notFound('Project not found');
    return { ok: true };
  });

  app.put('/api/projects/order', async (req) => {
    const { ids } = reorderSchema.parse(req.body);
    projects.reorderProjects(ids);
    return projects.listWithTodos();
  });

  app.post('/api/projects/:id/todos', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const todo = projects.createTodo(id, req.body);
    if (!todo) throw notFound('Project not found');
    reply.code(201);
    return todo;
  });

  app.put('/api/projects/:id/todos/order', async (req) => {
    const { id } = idParams.parse(req.params);
    const { ids } = reorderSchema.parse(req.body);
    projects.reorderTodos(id, ids);
    return projects.getProject(id);
  });

  app.patch('/api/todos/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const todo = projects.updateTodo(id, req.body);
    if (!todo) throw notFound('To-do not found');
    return todo;
  });

  app.delete('/api/todos/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    if (!projects.deleteTodo(id)) throw notFound('To-do not found');
    return { ok: true };
  });
}
