import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { SESSION_COOKIE, requireAdmin } from '../lib/auth-hooks.js';
import { clientIp, isHttpsRequest } from '../lib/network.js';
import { MIN_PASSWORD_LENGTH } from '../services/auth.js';

const passwordSchema = z.object({ password: z.string().min(1).max(200) });
const changeSchema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

export async function authRoutes(app: FastifyInstance, { ctx }: { ctx: AppContext }) {
  const { auth } = ctx;

  function startSession(req: FastifyRequest, reply: FastifyReply) {
    const { token, expiresAt } = auth.createSession(req.headers['user-agent'] ?? '');
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttpsRequest(req),
      expires: expiresAt,
    });
  }

  app.get('/api/auth/status', async (req) => ({
    authenticated: req.isAdmin,
    setupRequired: !auth.hasPassword(),
    isLan: req.isLan,
    minPasswordLength: MIN_PASSWORD_LENGTH,
  }));

  app.post('/api/auth/setup', async (req, reply) => {
    if (auth.hasPassword()) return reply.code(409).send({ error: 'Password already set' });
    if (!req.isLan) {
      return reply.code(403).send({ error: 'First-time setup must be done from the local network' });
    }
    const { password } = passwordSchema.parse(req.body);
    await auth.setPassword(password);
    startSession(req, reply);
    return { ok: true };
  });

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => clientIp(req),
        },
      },
    },
    async (req, reply) => {
      const { password } = passwordSchema.parse(req.body);
      if (!(await auth.verifyPassword(password))) {
        return reply.code(401).send({ error: 'Incorrect password' });
      }
      startSession(req, reply);
      return { ok: true };
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) auth.deleteSession(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/password', { preHandler: requireAdmin }, async (req, reply) => {
    const { current, next } = changeSchema.parse(req.body);
    if (!(await auth.verifyPassword(current))) {
      return reply.code(400).send({ error: 'Current password is incorrect' });
    }
    await auth.setPassword(next);
    // Sign out every other device.
    auth.deleteAllSessions();
    startSession(req, reply);
    return { ok: true };
  });
}
