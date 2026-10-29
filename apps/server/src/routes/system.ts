import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { HttpError } from '../lib/errors.js';
import { errorMessage } from '../lib/http.js';

export async function systemRoutes(app: FastifyInstance, { ctx }: { ctx: AppContext }) {
  const { input, system } = ctx;

  app.get('/api/system/input', async () => input.status());

  app.post('/api/system/tv', async (req) => {
    const { on } = z.object({ on: z.boolean() }).parse(req.body);
    try {
      await input.setTvPower(on);
    } catch (err) {
      throw new HttpError(502, `TV power command failed: ${errorMessage(err)}`);
    }
    return input.status().tvPower;
  });

  app.get('/api/system/info', async () => system.collect());
}
