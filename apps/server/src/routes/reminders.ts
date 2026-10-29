import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { notFound } from '../lib/errors.js';

const idParams = z.object({ id: z.coerce.number().int().positive() });

export async function remindersRoutes(app: FastifyInstance, { ctx }: { ctx: AppContext }) {
  const { reminders } = ctx;

  app.get('/api/reminders', async () => reminders.list());

  app.post('/api/reminders', async (req, reply) => {
    reply.code(201);
    return reminders.create(req.body);
  });

  app.patch('/api/reminders/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const updated = reminders.update(id, req.body);
    if (!updated) throw notFound('Reminder not found');
    return updated;
  });

  app.delete('/api/reminders/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    if (!reminders.remove(id)) throw notFound('Reminder not found');
    return { ok: true };
  });

  app.post('/api/reminders/clear-done', async () => ({ removed: reminders.clearDone() }));
}
