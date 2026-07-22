/**
 * End-to-end CORS header check against the Express app (no Socket.IO).
 * Run: NODE_ENV=production npx ts-node --transpile-only src/config/corsHttp.e2e.test.ts
 */
import http from 'http';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`Assertion failed: ${message}`);
    process.exit(1);
  }
}

async function request(
  port: number,
  method: string,
  path: string,
  origin?: string
): Promise<{ status: number; acao: string | undefined; acac: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: origin ? { Origin: origin } : {},
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
  assert(process.env.NODE_ENV === 'production', 'must run with NODE_ENV=production');
  const jwtSecret = (process.env.JWT_SECRET || '').trim();
  const insecure =
    !jwtSecret ||
    jwtSecret === 'your-secret-key' ||
    jwtSecret === 'your-secret-key-change-in-production' ||
    jwtSecret.length < 32;
  if (insecure) {
    process.env.JWT_SECRET = 'cors-e2e-reverify-secret-min-32-chars!!';
  }
  // Full `app` import constructs PrismaClient; CI has no real DB. Health/OPTIONS never query.
  if (!(process.env.DB_URL || '').trim()) {
    process.env.DB_URL = 'postgresql://ci:ci@127.0.0.1:5432/ci_cors_http_e2e';
  }

  const { default: app } = await import('../app');
  const { PROD_CORS_ORIGINS } = await import('./corsOrigins');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('no port');
  }
  const { port } = addr;

  try {
    for (const origin of PROD_CORS_ORIGINS) {
      const pre = await request(port, 'OPTIONS', '/api/health', origin);
      assert(pre.status === 200, `OPTIONS ${origin} status`);
      assert(pre.acao === origin, `OPTIONS ${origin} ACAO=${pre.acao}`);
      assert(pre.acac === 'true', `OPTIONS ${origin} credentials`);

      const get = await request(port, 'GET', '/health', origin);
      assert(get.status === 200, `GET ${origin} status`);
      assert(get.acao === origin, `GET ${origin} ACAO=${get.acao}`);
    }

    const bad = await request(port, 'OPTIONS', '/api/health', 'https://evil.example');
    assert(bad.status === 200, 'disallowed OPTIONS still 200');
    assert(bad.acao === undefined, `disallowed must not set ACAO (got ${bad.acao})`);

    const nullOrigin = await request(port, 'OPTIONS', '/api/health', 'null');
    assert(nullOrigin.acao === undefined, 'Origin null must not get ACAO');

    const noOrigin = await request(port, 'GET', '/health');
    assert(noOrigin.status === 200, 'no-Origin GET works');
    assert(noOrigin.acao === undefined, 'no-Origin should not need ACAO');

    console.log('corsHttp.e2e.test.ts: ok');
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    process.exit(0);
  } catch (err) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
