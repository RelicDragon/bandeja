import assert from 'node:assert/strict';
import express from 'express';
import { optionalAuth, type AuthRequest } from '../middleware/auth';
import { buildDetailedHealthPayload } from '../utils/healthInfo';
import { isLoopbackIp } from '../utils/isLoopbackIp';
import { ApiError } from '../utils/ApiError';
import { errorHandler } from '../middleware/errorHandler';
import { config } from '../config/env';

async function run() {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/api/health/details', optionalAuth, (req: AuthRequest, res, next) => {
    try {
      const isAdmin = Boolean(req.user?.isAdmin);
      const peer = req.socket?.remoteAddress;
      const localDevProbe = config.nodeEnv !== 'production' && isLoopbackIp(peer);
      if (!isAdmin && !localDevProbe) {
        throw new ApiError(403, 'Detailed health probe requires admin or local loopback');
      }
      res.json(buildDetailedHealthPayload());
    } catch (err) {
      next(err);
    }
  });
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  const url = `http://127.0.0.1:${port}/api/health/details`;

  try {
    // Spoofed XFF must not grant details when peer is remote — but we connect from loopback,
    // so localDevProbe still allows in non-production. Force production mode for this assert.
    const prevEnv = config.nodeEnv;
    (config as { nodeEnv: string }).nodeEnv = 'production';
    try {
      const spoof = await fetch(url, {
        headers: { 'X-Forwarded-For': '127.0.0.1' },
      });
      assert.equal(spoof.status, 403, 'prod + spoofed XFF must not unlock details without admin');
      const body = (await spoof.json()) as { database?: unknown };
      assert.equal(body.database, undefined);
    } finally {
      (config as { nodeEnv: string }).nodeEnv = prevEnv;
    }

    const local = await fetch(url);
    assert.equal(local.status, 200, 'non-prod loopback peer may read details');
    const ok = (await local.json()) as { database?: { name?: string } };
    assert.ok(ok.database?.name);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  console.log('healthDetailsAccess.test.ts: ok');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
