import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { errorMessage, fetchJson } from '../lib/http.js';

interface GeocodeResponse {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
    country?: string;
    admin1?: string;
  }[];
}

export async function settingsRoutes(app: FastifyInstance, { ctx }: { ctx: AppContext }) {
  const { settings } = ctx;

  app.get('/api/settings', async () => settings.get());

  app.patch('/api/settings', async (req) => {
    const next = settings.update(req.body ?? {});
    return next;
  });

  app.get('/api/timezones', async () => Intl.supportedValuesOf('timeZone'));

  app.get('/api/geocode', async (req, reply) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(100) }).parse(req.query);
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=${encodeURIComponent(q)}`;
      const res = await fetchJson<GeocodeResponse>(url, { timeoutMs: 8000 });
      return (res.results ?? []).map((r) => ({
        name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone,
      }));
    } catch (err) {
      return reply.code(502).send({ error: `Location lookup failed: ${errorMessage(err)}` });
    }
  });
}
