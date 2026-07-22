import assert from 'node:assert/strict';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { rateLimitKeyFromRequest } from '../utils/rateLimitClientKey';
import { errorHandler } from '../middleware/errorHandler';

async function runPhoneLimiterIgnoresSpoofedHeaders(): Promise<void> {
  const phoneAuthLimiter = rateLimit({
    windowMs: 60_000,
    max: 3,
    message: { success: false, message: 'Too many phone auth attempts' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => rateLimitKeyFromRequest(req),
  });

  const app = express();
  // No trust proxy: req.ip is the TCP peer (127.0.0.1). Spoofed forwarded headers must not reset the bucket.
  app.set('trust proxy', false);
  app.use(express.json());
  app.post('/login/phone', phoneAuthLimiter, (_req, res) => {
    res.json({ success: true });
  });
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  const url = `http://127.0.0.1:${port}/login/phone`;

  try {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': `198.51.100.${i}`,
          'cf-connecting-ip': `203.0.113.${i}`,
        },
        body: JSON.stringify({ phone: '+10000000000', password: 'x' }),
      });
      assert.equal(res.status, 200, `attempt ${i + 1} should succeed`);
    }

    const blocked = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '198.51.100.99',
        'cf-connecting-ip': '203.0.113.99',
      },
      body: JSON.stringify({ phone: '+10000000000', password: 'x' }),
    });
    assert.equal(blocked.status, 429, '4th attempt must 429; spoofed headers must not reset bucket');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function run() {
  await runPhoneLimiterIgnoresSpoofedHeaders();
  console.log('phoneAuthRateLimit.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
