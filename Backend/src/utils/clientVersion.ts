import type { Request } from 'express';

export function getClientPlatform(req: Request): string {
  const p = req.headers['x-client-platform'];
  if (typeof p === 'string' && ['web', 'ios', 'android'].includes(p)) return p;
  return 'unknown';
}
