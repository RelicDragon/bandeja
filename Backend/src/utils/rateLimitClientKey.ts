import type { Request } from 'express';

/** Prefer proxy-provided client IP so global limits are not shared across users behind one edge IP. */
export function rateLimitKeyFromRequest(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string') {
    const t = cf.split(',')[0]?.trim();
    if (t) return t;
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  return req.ip ?? 'unknown';
}
