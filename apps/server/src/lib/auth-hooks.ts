import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthService } from '../services/auth.js';
import { isLanRequest } from './network.js';

declare module 'fastify' {
  interface FastifyRequest {
    isAdmin: boolean;
    isLan: boolean;
  }
}

export const SESSION_COOKIE = 'ob_session';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function registerAuthHooks(app: FastifyInstance, auth: AuthService): void {
  app.decorateRequest('isAdmin', false);
  app.decorateRequest('isLan', false);

  app.addHook('onRequest', async (req, reply) => {
    req.isLan = isLanRequest(req);
    req.isAdmin = auth.validateSession(req.cookies[SESSION_COOKIE]);

    // The display needs no login on the LAN, but over the tunnel it does.
    const url = req.url.split('?')[0];
    if ((url === '/display' || url === '/display/') && !req.isLan && !req.isAdmin) {
      return reply.redirect('/admin/login?next=/display');
    }

    // Session cookies are SameSite=Lax; also refuse cross-origin writes outright.
    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
        let originHost = '';
        try {
          originHost = new URL(origin).host;
        } catch {
          /* malformed origin */
        }
        if (originHost !== host) {
          return reply.code(403).send({ error: 'Cross-origin request blocked' });
        }
      }
    }
  });
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.isAdmin) return reply.code(401).send({ error: 'Not signed in' });
}

/** The TV display may be used unauthenticated from the LAN; from the internet it needs a session. */
export async function requireLanOrAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.isLan && !req.isAdmin) return reply.code(401).send({ error: 'Not signed in' });
}
