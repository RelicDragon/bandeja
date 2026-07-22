/**
 * Minimal Express CORS stack matching Backend/src/app.ts (no JWT/DB).
 * Proves allowlist accept/deny without booting full app.
 */
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import {
  createCorsOriginDelegate,
  getCorsAllowedOrigins,
  isCorsOriginAllowed,
  PROD_CORS_ORIGINS,
} from './corsOrigins';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`Assertion failed: ${message}`);
    process.exit(1);
  }
}

function request(
  port: number,
  method: string,
  path: string,
  origin?: string
): Promise<{ status: number; acao?: string; acac?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: origin ? { Origin: origin, 'Access-Control-Request-Method': 'GET' } : {},
      },
      (res) => {
        res.resume();
        resolve({
          status: res.statusCode || 0,
          acao: res.headers['access-control-allow-origin'] as string | undefined,
          acac: res.headers['access-control-allow-credentials'] as string | undefined,
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function main(): Promise<void> {
  const allowed = getCorsAllowedOrigins({
    nodeEnv: 'production',
    frontendUrl: 'https://bandeja.me',
    extraOrigins: '',
  });
  for (const o of PROD_CORS_ORIGINS) {
    assert(allowed.includes(o), `allowlist ${o}`);
  }

  const app = express();
  app.use((req, res, next) => {
    if (req.method !== 'OPTIONS') {
      next();
      return;
    }
    const origin = req.get('Origin');
    if (isCorsOriginAllowed(origin, allowed)) {
      res.setHeader('Access-Control-Allow-Origin', origin!);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.sendStatus(200);
  });
  app.use(
    cors({
      origin: createCorsOriginDelegate(allowed),
      credentials: true,
    })
  );
  app.get('/health', (_req, res) => res.json({ ok: true }));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  const { port } = addr;

  try {
    for (const origin of PROD_CORS_ORIGINS) {
      const pre = await request(port, 'OPTIONS', '/health', origin);
      assert(pre.acao === origin, `OPTIONS ACAO ${origin}`);
      assert(pre.acac === 'true', `OPTIONS credentials ${origin}`);
      const get = await request(port, 'GET', '/health', origin);
      assert(get.acao === origin, `GET ACAO ${origin}`);
    }
    const bad = await request(port, 'OPTIONS', '/health', 'https://evil.example');
    assert(bad.acao === undefined, 'evil denied');
    const nullOrigin = await request(port, 'OPTIONS', '/health', 'null');
    assert(nullOrigin.acao === undefined, 'null denied');
    console.log('corsStack.e2e.test.ts: ok');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    process.exit(0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
