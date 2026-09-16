import type { Request, Response } from 'express';

/**
 * Endpoints every client polls on a timer. A fast 2xx on these says nothing that
 * the next one will not, and together they dominated the production log volume.
 * Failures and slow responses on the same paths are still logged.
 */
export const HOT_POLL_PATH_PREFIXES = [
  '/health',
  '/api/health',
  '/api/chat/sync/events',
  '/api/chat/sync/batch-head',
  '/api/chat/unread-objects',
  '/api/chat/messages/missed',
  '/api/chat/drafts/all',
  '/api/users/presence',
  '/api/weather/day',
] as const;

/** Anything slower than this stays in the log even on a hot path. */
export const SLOW_REQUEST_LOG_MS = 1000;

const START_AT = Symbol('httpLogStartAt');

type TimedRequest = Request & { [START_AT]?: bigint };

export function markHttpLogStart(req: Request, _res: Response, next: () => void): void {
  (req as TimedRequest)[START_AT] = process.hrtime.bigint();
  next();
}

function elapsedMs(req: Request): number {
  const startedAt = (req as TimedRequest)[START_AT];
  if (startedAt == null) return 0;
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function isHotPollPath(path: string): boolean {
  return HOT_POLL_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)
  );
}

/** morgan `skip`: drop only fast, successful, high-frequency polls. */
export function shouldSkipHttpLog(req: Request, res: Response): boolean {
  if (res.statusCode >= 400) return false;
  const path = req.originalUrl ?? req.url ?? '';
  const queryStart = path.indexOf('?');
  if (!isHotPollPath(queryStart === -1 ? path : path.slice(0, queryStart))) return false;
  return elapsedMs(req) < SLOW_REQUEST_LOG_MS;
}
