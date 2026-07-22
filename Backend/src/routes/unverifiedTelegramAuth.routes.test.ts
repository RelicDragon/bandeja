import assert from 'node:assert/strict';
import express from 'express';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler';

async function runTelegramUnverifiedRejected(): Promise<void> {
  const authRoutes = (await import('../routes/auth.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}/api/auth`;

  try {
    for (const path of ['/login/telegram', '/register/telegram'] as const) {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: 'attacker-telegram-id',
          firstName: 'Attacker',
        }),
      });
      assert.equal(res.status, 404, `${path} must not exist`);
      const text = await res.text();
      assert.ok(!/"token"\s*:/.test(text), `${path} must not return access token`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function run() {
  await runTelegramUnverifiedRejected();
  console.log('unverifiedTelegramAuth.routes.test.ts: ok');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
