import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { optionalAuth, type AuthRequest } from './auth';
import { errorHandler } from './errorHandler';
import { config } from '../config/env';

/**
 * `optionalAuth` must answer 401 `auth.accessExpired` for a presented-but-expired bearer
 * (clients refresh and retry) while still treating a garbage token as anonymous.
 * Regression: the watch and web used to be silently downgraded to guests on
 * `GET /games/:id` / `GET /results/game/:id`, which 404s private games.
 */
async function run() {
  const app = express();
  app.get('/probe', optionalAuth, (req: AuthRequest, res) => {
    res.json({ userId: req.userId ?? null });
  });
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  const url = `http://127.0.0.1:${port}/probe`;

  try {
    const expired = jwt.sign(
      { userId: 'user-1', typ: 'access', ver: 1, iss: config.jwtIssuer, aud: config.jwtAudience },
      config.jwtSecret,
      { algorithm: 'HS256', expiresIn: -60 }
    );
    const expiredRes = await fetch(url, { headers: { Authorization: `Bearer ${expired}` } });
    assert.equal(expiredRes.status, 401, 'expired bearer must not be downgraded to anonymous');
    const body = (await expiredRes.json()) as { code?: string };
    assert.equal(body.code, 'auth.accessExpired');

    const garbage = await fetch(url, { headers: { Authorization: 'Bearer not-a-jwt' } });
    assert.equal(garbage.status, 200, 'invalid bearer still falls back to anonymous');
    assert.deepEqual(await garbage.json(), { userId: null });

    const anon = await fetch(url);
    assert.equal(anon.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  console.log('optionalAuthExpired.test.ts: ok');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
