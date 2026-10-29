import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DATA_SOURCES, displayCommandSchema } from '@officeboard/shared';
import type { AppContext } from '../context.js';
import { notFound } from '../lib/errors.js';

const idParams = z.object({ id: z.string().min(1) });

export async function screensRoutes(app: FastifyInstance, { ctx }: { ctx: AppContext }) {
  const { screens, rotation, hub, data, settings } = ctx;

  app.get('/api/screens', async () => screens.list());

  app.post('/api/screens', async (req, reply) => {
    reply.code(201);
    return screens.create(req.body);
  });

  app.patch('/api/screens/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const updated = screens.update(id, req.body);
    if (!updated) throw notFound('Screen not found');
    return updated;
  });

  app.delete('/api/screens/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    if (!screens.remove(id)) throw notFound('Screen not found');
    return { ok: true };
  });

  app.put('/api/screens/order', async (req) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
    screens.reorder(ids);
    return screens.list();
  });

  app.get('/api/display/state', async () => ({
    rotation: rotation.getState(),
    config: hub.config(),
    displayClients: hub.count('display'),
    sources: Object.fromEntries(
      DATA_SOURCES.map((s) => {
        const env = data.get(s);
        return [s, { updatedAt: env.updatedAt, error: env.error }];
      }),
    ),
  }));

  app.post('/api/display/command', async (req) => {
    const { command } = z.object({ command: displayCommandSchema }).parse(req.body);
    rotation.command(command, 'admin');
    return { rotation: rotation.getState() };
  });

  app.post('/api/display/pin', async (req) => {
    const { screenId } = z.object({ screenId: z.string().nullable() }).parse(req.body);
    if (screenId && !screens.get(screenId)) throw notFound('Screen not found');
    settings.update({ rotation: { pinnedScreenId: screenId } });
    return { rotation: rotation.getState() };
  });

  app.post('/api/display/paused', async (req) => {
    const { paused } = z.object({ paused: z.boolean() }).parse(req.body);
    settings.update({ rotation: { paused } });
    return { rotation: rotation.getState() };
  });

  app.post('/api/display/reload', async () => {
    hub.reloadDisplays();
    return { ok: true };
  });

  app.post('/api/data/:source/refresh', async (req) => {
    const { source } = z.object({ source: z.enum(DATA_SOURCES) }).parse(req.params);
    await data.refresh(source);
    const env = data.get(source);
    return { updatedAt: env.updatedAt, error: env.error };
  });
}
