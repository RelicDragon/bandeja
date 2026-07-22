import type { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';

/**
 * Rate-limit key from Express trusted `req.ip` (after `trust proxy`).
 * Do not read spoofable `X-Forwarded-For` / `cf-connecting-ip` headers directly.
 */
export function rateLimitKeyFromRequest(req: Request): string {
  const ip = req.ip?.trim();
  if (!ip) return 'unknown';
  return ipKeyGenerator(ip);
}
