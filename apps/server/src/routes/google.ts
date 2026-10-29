import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { requireAdmin } from '../lib/auth-hooks.js';
import { errorMessage } from '../lib/http.js';
import { requestOrigin } from '../lib/network.js';

export async function googleRoutes(app: FastifyInstance, { ctx }: { ctx: AppContext }) {
  const { google, settings, data } = ctx;

  app.get('/api/google/callback', async (req, reply) => {
    if (!req.isAdmin) return reply.redirect('/admin/login?next=/admin/integrations');
    const q = z
      .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
      .parse(req.query);
    const back = (status: string) =>
      reply.redirect(`/admin/integrations?google=${encodeURIComponent(status)}`);
    if (q.error || !q.code || !q.state) return back(q.error ?? 'cancelled');
    try {
      await google.handleCallback(q.code, q.state);
      void data.refresh('calendar');
      return back('connected');
    } catch (err) {
      return back(errorMessage(err));
    }
  });

  app.register(async (admin) => {
    admin.addHook('preHandler', requireAdmin);

    admin.get('/api/google/status', async (req) => ({
      clientId: settings.get().google.clientId,
      clientSecretSet: google.hasClientSecret(),
      connected: google.isConnected(),
      redirectUri: google.redirectUri(requestOrigin(req)),
      publicUrl: settings.get().google.publicUrl,
      calendarIds: settings.get().google.calendarIds,
    }));

    admin.put('/api/google/credentials', async (req) => {
      const body = z
        .object({
          clientId: z.string().trim().max(300),
          clientSecret: z.string().trim().max(300).optional(),
          publicUrl: z.string().trim().max(300).optional(),
        })
        .parse(req.body);
      google.setCredentials(body.clientId, body.clientSecret || undefined);
      if (body.publicUrl !== undefined) settings.update({ google: { publicUrl: body.publicUrl } });
      return { ok: true };
    });

    admin.get('/api/google/auth-url', async (req) => ({
      url: google.createAuthUrl(google.redirectUri(requestOrigin(req))),
    }));

    admin.post('/api/google/disconnect', async () => {
      await google.disconnect();
      await data.refresh('calendar');
      return { ok: true };
    });

    admin.get('/api/google/calendars', async () => google.listCalendars(true));

    admin.put('/api/google/calendars', async (req) => {
      const { ids } = z.object({ ids: z.array(z.string()) }).parse(req.body);
      settings.update({ google: { calendarIds: ids } });
      await data.refresh('calendar');
      return { ok: true };
    });
  });
}
