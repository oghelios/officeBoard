import fs from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { config } from './config.js';
import type { AppContext } from './context.js';
import { createDb } from './db/index.js';
import { InputManager } from './input/manager.js';
import { registerAuthHooks, requireAdmin } from './lib/auth-hooks.js';
import { GoogleCalendarService } from './providers/google-calendar.js';
import { fetchNews } from './providers/news.js';
import { SystemMonitor } from './providers/system.js';
import { fetchWeather } from './providers/weather.js';
import { authRoutes } from './routes/auth.js';
import { googleRoutes } from './routes/google.js';
import { photosRoutes } from './routes/photos.js';
import { projectsRoutes } from './routes/projects.js';
import { remindersRoutes } from './routes/reminders.js';
import { screensRoutes } from './routes/screens.js';
import { settingsRoutes } from './routes/settings.js';
import { systemRoutes } from './routes/system.js';
import { AuthService } from './services/auth.js';
import { DataHub } from './services/data-hub.js';
import { DisplayHub } from './services/display-hub.js';
import { PhotosService } from './services/photos.js';
import { ProjectsService } from './services/projects.js';
import { RemindersService } from './services/reminders.js';
import { RotationEngine } from './services/rotation.js';
import { ScreensService } from './services/screens.js';
import { SettingsService } from './services/settings.js';

const SYSTEM_POLL_MS = 10_000;

export function createContext(): AppContext {
  const db = createDb();
  const settings = new SettingsService(db);
  const screens = new ScreensService(db);
  const data = new DataHub();
  const rotation = new RotationEngine(screens, settings);
  const hub = new DisplayHub(screens, settings, rotation, data);
  const ctx: AppContext = {
    db,
    settings,
    screens,
    data,
    rotation,
    hub,
    auth: new AuthService(db, settings),
    projects: new ProjectsService(db),
    reminders: new RemindersService(db),
    photos: new PhotosService(db),
    google: new GoogleCalendarService(settings),
    system: new SystemMonitor(() => hub.count('display')),
    input: new InputManager(settings, rotation),
  };
  wireProviders(ctx);
  return ctx;
}

function wireProviders(ctx: AppContext): void {
  const { data, settings, screens } = ctx;
  const minutes = (n: number) => n * 60_000;

  data.register({
    source: 'weather',
    intervalMs: () => minutes(settings.get().refresh.weatherMinutes),
    fetch: () => fetchWeather(settings.get()),
  });
  data.register({
    source: 'news',
    intervalMs: () => minutes(settings.get().refresh.newsMinutes),
    fetch: () => fetchNews(settings.get()),
  });
  data.register({
    source: 'calendar',
    intervalMs: () => minutes(settings.get().refresh.calendarMinutes),
    fetch: () => ctx.google.fetchData(),
  });
  data.register({
    source: 'system',
    intervalMs: () => SYSTEM_POLL_MS,
    fetch: () => ctx.system.collect(),
  });
  data.register({
    source: 'projects',
    intervalMs: () => null,
    fetch: async () => ({ projects: ctx.projects.listWithTodos() }),
  });
  data.register({
    source: 'reminders',
    intervalMs: () => null,
    fetch: async () => ({ reminders: ctx.reminders.list() }),
  });
  data.register({
    source: 'photos',
    intervalMs: () => null,
    fetch: async () => ({ photos: ctx.photos.listWithUrls() }),
  });

  ctx.projects.on('change', () => void data.refresh('projects'));
  ctx.reminders.on('change', () => void data.refresh('reminders'));
  ctx.photos.on('change', () => void data.refresh('photos'));

  settings.on('change', (next, prev) => {
    const changed = (...keys: (keyof typeof next)[]) =>
      keys.some((k) => JSON.stringify(next[k]) !== JSON.stringify(prev[k]));
    if (changed('location', 'units')) void data.refresh('weather');
    if (changed('newsFeeds')) void data.refresh('news');
    if (changed('refresh')) {
      data.reschedule('weather');
      data.reschedule('news');
      data.reschedule('calendar');
    }
    if (JSON.stringify(next.google.calendarIds) !== JSON.stringify(prev.google.calendarIds)) {
      void data.refresh('calendar');
    }
  });

  // Keep schedules and the pin consistent when a screen is deleted.
  screens.on('change', () => {
    const ids = new Set(screens.list().map((s) => s.id));
    const s = settings.get();
    const schedules = s.schedules.filter((r) => ids.has(r.screenId));
    const pinnedGone = Boolean(s.rotation.pinnedScreenId && !ids.has(s.rotation.pinnedScreenId));
    if (schedules.length !== s.schedules.length || pinnedGone) {
      settings.update({ schedules, ...(pinnedGone && { rotation: { pinnedScreenId: null } }) });
    }
  });
}

export async function buildServer(ctx: AppContext) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 1024 * 1024,
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof ZodError) {
      const message = err.issues
        .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
        .join('; ');
      return reply.code(400).send({ error: message });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 && !err.statusCode ? 'Internal server error' : err.message });
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 50 } });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  registerAuthHooks(app, ctx.auth);

  app.get('/api/health', async () => ({ ok: true }));

  await app.register(authRoutes, { ctx });
  await app.register(photosRoutes, { ctx });
  await app.register(googleRoutes, { ctx });
  await app.register(async (admin) => {
    admin.addHook('preHandler', requireAdmin);
    await admin.register(settingsRoutes, { ctx });
    await admin.register(screensRoutes, { ctx });
    await admin.register(projectsRoutes, { ctx });
    await admin.register(remindersRoutes, { ctx });
    await admin.register(systemRoutes, { ctx });
  });

  app.get('/ws', { websocket: true }, (socket, req) => {
    const role = (req.query as { role?: string }).role === 'admin' ? 'admin' : 'display';
    const allowed = role === 'admin' ? req.isAdmin : req.isLan || req.isAdmin;
    if (!allowed) {
      socket.close(4401, 'Not signed in');
      return;
    }
    ctx.hub.attach(socket, role);
  });

  const indexHtml = path.join(config.webDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false, index: false });
    app.setNotFoundHandler((req, reply) => {
      const url = req.url.split('?')[0];
      if (req.method !== 'GET' || url.startsWith('/api/') || url.startsWith('/media/') || url === '/ws') {
        return reply.code(404).send({ error: 'Not found' });
      }
      // Hashed asset files are cacheable; the HTML shell must always be fresh.
      reply.header('cache-control', 'no-cache');
      return reply.type('text/html').send(fs.createReadStream(indexHtml));
    });
  } else {
    app.log.warn(`Web build not found at ${config.webDist}; run "pnpm build" (or use "pnpm dev").`);
  }

  return app;
}

export function startBackground(ctx: AppContext): void {
  ctx.auth.purgeExpired();
  ctx.data.start();
  ctx.rotation.start();
  ctx.system.start();
  ctx.input.start();
}

export function stopBackground(ctx: AppContext): void {
  ctx.data.stop();
  ctx.rotation.stop();
  ctx.system.stop();
  ctx.input.stop();
  ctx.hub.close();
}
