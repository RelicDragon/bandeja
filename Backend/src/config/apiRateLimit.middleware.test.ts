import assert from 'node:assert/strict';
import express from 'express';
import rateLimit from 'express-rate-limit';
import type { Server } from 'node:http';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import {
  DEFAULT_API_RATE_LIMIT_SKIP_PATH_PREFIXES,
  shouldSkipApiRateLimit,
} from './apiRateLimit';

async function withServer(
  app: express.Application,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function run() {
  const app = express();
  app.set('trust proxy', false);

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 3,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      code: 'rateLimit.global',
    },
    keyGenerator: (req) => rateLimitKeyFromRequest(req),
    skip: (req) =>
      shouldSkipApiRateLimit(req.path || '', [...DEFAULT_API_RATE_LIMIT_SKIP_PATH_PREFIXES]),
  });

  app.use('/api/', limiter);
  app.get('/api/games/available', (_req, res) => res.json({ ok: true }));
  app.get('/api/chat/sync/events', (_req, res) => res.json({ sync: true }));

  await withServer(app, async (base) => {
    // Query embedding a skip prefix must still count against the limit
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`${base}/api/games/available?x=/chat/sync/`);
      assert.equal(r.status, 200, `request ${i + 1} should pass`);
    }
    const blocked = await fetch(`${base}/api/games/available?x=/chat/sync/`);
    assert.equal(blocked.status, 429, '4th request must 429 despite query poison');
    const body = (await blocked.json()) as { code?: string; success?: boolean };
    assert.equal(body.code, 'rateLimit.global');
    assert.equal(body.success, false);

    // Skipped sync path must not consume / be blocked by the same bucket
    const sync = await fetch(`${base}/api/chat/sync/events`);
    assert.equal(sync.status, 200, 'skipped sync path stays available');
  });

  console.log('apiRateLimit.middleware.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
