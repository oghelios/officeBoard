import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import type { AppContext } from '../context.js';
import { requireAdmin, requireLanOrAdmin } from '../lib/auth-hooks.js';
import { notFound } from '../lib/errors.js';
import { errorMessage } from '../lib/http.js';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const SAFE_FILENAME = /^[A-Za-z0-9_-]+\.jpg$/;

export async function photosRoutes(app: FastifyInstance, { ctx }: { ctx: AppContext }) {
  const { photos } = ctx;

  app.get('/media/photos/:file', { preHandler: requireLanOrAdmin }, async (req, reply) => {
    const { file } = z.object({ file: z.string() }).parse(req.params);
    if (!SAFE_FILENAME.test(file)) throw notFound();
    const full = path.join(config.photosDir, file);
    if (!fs.existsSync(full)) throw notFound();
    reply.header('cache-control', 'private, max-age=604800, immutable');
    reply.type('image/jpeg');
    return reply.send(fs.createReadStream(full));
  });

  app.register(async (admin) => {
    admin.addHook('preHandler', requireAdmin);

    admin.get('/api/photos', async () => photos.listWithUrls());

    admin.post('/api/photos', async (req, reply) => {
      const uploaded = [];
      const failed: { name: string; error: string }[] = [];
      for await (const part of req.files()) {
        try {
          const buffer = await part.toBuffer();
          uploaded.push(await photos.add(buffer, part.filename));
        } catch (err) {
          failed.push({ name: part.filename, error: errorMessage(err) });
        }
      }
      reply.code(uploaded.length > 0 ? 201 : 400);
      return { uploaded, failed };
    });

    admin.patch('/api/photos/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      const { caption } = z.object({ caption: z.string().max(300) }).parse(req.body);
      const photo = photos.updateCaption(id, caption);
      if (!photo) throw notFound('Photo not found');
      return photo;
    });

    admin.delete('/api/photos/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      if (!(await photos.remove(id))) throw notFound('Photo not found');
      return { ok: true };
    });
  });
}
