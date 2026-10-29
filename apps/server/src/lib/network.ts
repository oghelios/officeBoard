import net from 'node:net';
import type { FastifyRequest } from 'fastify';

/**
 * Requests relayed by cloudflared arrive from localhost, so the Cloudflare headers are what
 * distinguish "came in over the internet" from "came from the LAN".
 */
export function isTunneledRequest(req: FastifyRequest): boolean {
  return Boolean(req.headers['cf-connecting-ip'] || req.headers['cf-ray']);
}

export function clientIp(req: FastifyRequest): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  return req.socket.remoteAddress ?? req.ip;
}

export function isPrivateAddress(raw: string): boolean {
  let ip = raw.trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    );
  }
  return false;
}

/** True when the request originates on the local network (and not via the tunnel). */
export function isLanRequest(req: FastifyRequest): boolean {
  if (isTunneledRequest(req)) return false;
  return isPrivateAddress(req.socket.remoteAddress ?? '');
}

export function isHttpsRequest(req: FastifyRequest): boolean {
  if (req.protocol === 'https') return true;
  const proto = req.headers['x-forwarded-proto'];
  return isTunneledRequest(req) && (proto === undefined || proto === 'https');
}

/** Origin (scheme://host) the browser used to reach us. */
export function requestOrigin(req: FastifyRequest): string {
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'localhost';
  return `${isHttpsRequest(req) ? 'https' : 'http'}://${host}`;
}
