import type { Request } from 'express';
import { config } from '../config/env';

function parseSemver(s: string): [number, number, number] | null {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(s.trim());
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2] ?? '0', 10), parseInt(m[3] ?? '0', 10)];
}

function cmpSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    const d = a[i] - b[i];
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function clientVersionSupportsRefresh(req: Request): boolean {
  const raw = req.headers['x-client-version'];
  if (typeof raw !== 'string' || !raw.trim()) return false;
  const client = parseSemver(raw);
  const min = parseSemver(config.minClientVersionForRefresh);
  if (!client || !min) return false;
  return cmpSemver(client, min) >= 0;
}

export function getClientPlatform(req: Request): string {
  const p = req.headers['x-client-platform'];
  if (typeof p === 'string' && ['web', 'ios', 'android'].includes(p)) return p;
  return 'unknown';
}
