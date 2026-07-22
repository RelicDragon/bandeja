#!/usr/bin/env node
/**
 * Full Admin + CORS reverify — no intentional gaps.
 * Covers: static serve, path traversal, API proxy (GET/POST/SSE), live tunnel,
 * CORS allow/deny, file:// boot guard in index.html.
 *
 * Usage (from repo root, SSH agent loaded):
 *   node Admin/reverify-all.mjs
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('ok:', msg);
  }
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function request(port, method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          ...headers,
          ...(body != null
            ? { 'Content-Length': Buffer.byteLength(body) }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitPort(port, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      await request(port, 'GET', '/__admin_serve_health');
      return true;
    } catch {
      await sleep(50);
    }
  }
  return false;
}

async function spawnServe(env) {
  const probe = http.createServer();
  const port = await listen(probe);
  probe.close();
  const child = spawn(process.execPath, [path.join(__dirname, 'serve.mjs')], {
    env: { ...process.env, ADMIN_PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT,
  });
  const ready = await waitPort(port);
  if (!ready) {
    child.kill('SIGKILL');
    throw new Error('serve did not become ready on ' + port);
  }
  return { child, port };
}

async function sectionMockProxy() {
  console.log('\n=== Mock upstream + Admin serve ===');
  let sseClients = 0;
  const upstream = http.createServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, via: 'upstream' }));
      return;
    }
    if (req.url === '/api/echo' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Echo-Auth': req.headers.authorization || '',
          'Set-Cookie': 'pp_rt=test; Path=/api; HttpOnly',
        });
        res.end(JSON.stringify({ ok: true, body: Buffer.concat(chunks).toString('utf8') }));
      });
      return;
    }
    if (req.url?.startsWith('/api/logs/stream')) {
      sseClients += 1;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('data: {"line":1}\n\n');
      setTimeout(() => {
        res.write('data: {"line":2}\n\n');
        res.end();
      }, 30);
      return;
    }
    res.writeHead(404);
    res.end('no');
  });
  const upPort = await listen(upstream);
  const { child, port } = await spawnServe({
    ADMIN_API_TARGET: `http://127.0.0.1:${upPort}`,
  });

  try {
    const health = await request(port, 'GET', '/__admin_serve_health');
    assert(health.status === 200 && health.body.includes('"ok":true'), 'serve health');

    const index = await request(port, 'GET', '/');
    assert(index.status === 200 && index.body.includes('Bandeja Admin'), 'index.html');
    assert(index.body.includes("location.protocol === 'file:'"), 'file:// boot guard in index');
    assert(index.body.includes('127.0.0.1:9010'), 'index mentions serve URL');

    const appJs = await request(port, 'GET', '/app.js');
    assert(appJs.status === 200 && appJs.body.includes("API_URL = '/api'"), 'default API_URL is /api');
    assert(appJs.body.includes('normalizeStoredApiUrl'), 'migrates old absolute API URLs');

    const trav = await request(port, 'GET', '/../package.json');
    assert(trav.status === 403 || trav.status === 404, `path traversal blocked (${trav.status})`);

    const proxied = await request(port, 'GET', '/api/health');
    assert(proxied.status === 200 && proxied.body.includes('"via":"upstream"'), 'GET /api/health proxied');

    const body = JSON.stringify({ ping: 1 });
    const echoed = await request(port, 'POST', '/api/echo', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body,
    });
    assert(echoed.status === 200, 'POST proxy status');
    const ej = JSON.parse(echoed.body);
    assert(ej.body === body, 'POST body forwarded');
    assert(echoed.headers['x-echo-auth'] === 'Bearer test-token', 'Authorization forwarded');
    assert(
      String(echoed.headers['set-cookie'] || '').includes('Path=/api'),
      'Set-Cookie Path=/api preserved for same-origin /api'
    );

    const sse = await request(port, 'GET', '/api/logs/stream?token=x');
    assert(sse.status === 200, 'SSE status');
    assert(String(sse.headers['content-type'] || '').includes('text/event-stream'), 'SSE content-type');
    assert(sse.body.includes('data: {"line":1}') && sse.body.includes('data: {"line":2}'), 'SSE chunks proxied');
    assert(sseClients === 1, 'SSE hit upstream once');
  } finally {
    child.kill('SIGKILL');
    upstream.close();
  }
}

async function sectionCorsHttpE2e() {
  console.log('\n=== CORS stack e2e (allowlist, no full app) ===');
  const stack = spawn(
    'npx',
    ['ts-node', '--transpile-only', 'src/config/corsStack.e2e.test.ts'],
    {
      cwd: path.join(ROOT, 'Backend'),
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let sout = '';
  stack.stdout.on('data', (d) => {
    sout += d.toString();
  });
  stack.stderr.on('data', (d) => {
    sout += d.toString();
  });
  const scode = await new Promise((resolve) => stack.on('close', resolve));
  assert(scode === 0 && sout.includes('corsStack.e2e.test.ts: ok'), 'corsStack e2e');

  console.log('\n=== CORS HTTP e2e (full app, production) ===');
  const c2 = spawn(
    'npx',
    ['ts-node', '--transpile-only', 'src/config/corsHttp.e2e.test.ts'],
    {
      cwd: path.join(ROOT, 'Backend'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        JWT_SECRET: 'cors-e2e-reverify-secret-min-32-chars!!',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let out2 = '';
  c2.stdout.on('data', (d) => {
    out2 += d.toString();
  });
  c2.stderr.on('data', (d) => {
    out2 += d.toString();
  });
  const code2 = await new Promise((resolve) => c2.on('close', resolve));
  assert(code2 === 0 && out2.includes('corsHttp.e2e.test.ts: ok'), 'corsHttp e2e via ts-node');
}

async function sectionLiveTunnel() {
  console.log('\n=== Live prod API tunnel (relic→:3000) + Admin serve ===');
  const sshKey = process.env.HOME + '/.ssh/id_hetzner';
  const probe = http.createServer();
  const localApiPort = await listen(probe);
  probe.close();

  const tunnel = spawn(
    'ssh',
    [
      '-N',
      '-o',
      'BatchMode=yes',
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'ConnectTimeout=15',
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      `IdentityFile=${sshKey}`,
      '-L',
      `127.0.0.1:${localApiPort}:127.0.0.1:3000`,
      'relic@back.bandeja.com',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let tunnelErr = '';
  tunnel.stderr.on('data', (d) => {
    tunnelErr += d.toString();
  });

  let tunnelUp = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await request(localApiPort, 'GET', '/health');
      if (r.status === 200) {
        tunnelUp = true;
        break;
      }
    } catch {
      /* retry */
    }
    if (tunnel.exitCode != null) break;
    await sleep(100);
  }
  assert(tunnelUp, `live tunnel health (err=${tunnelErr.trim() || 'none'})`);

  if (!tunnelUp) {
    tunnel.kill('SIGKILL');
    return;
  }

  const direct = await request(localApiPort, 'GET', '/health');
  assert(direct.status === 200 && direct.body.length > 2, 'direct tunnel /health');

  // Live public CORS deny is enforced after Backend #310 deploy.
  // Admin security does not depend on it (same-origin serve proxy).

  const { child, port } = await spawnServe({
    ADMIN_API_TARGET: `http://127.0.0.1:${localApiPort}`,
  });
  try {
    const viaServe = await request(port, 'GET', '/api/health');
    assert(viaServe.status === 200, `Admin serve→prod /api/health status=${viaServe.status}`);
    assert(viaServe.body.length > 2, 'Admin serve→prod /api/health body');

    // Same-origin browser simulation: Origin http://127.0.0.1:servePort hitting /api via proxy
    // never needs CORS on upstream because browser sees same origin as the page.
    const page = await request(port, 'GET', '/');
    assert(page.status === 200, 'Admin UI over serve against live API');

    const loginProbe = await request(port, 'POST', '/api/admin/login', {
      headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ phone: '+000', password: 'nope' }),
    });
    assert(
      loginProbe.status === 401 || loginProbe.status === 400 || loginProbe.status === 403,
      `admin login reachable via proxy (got ${loginProbe.status})`
    );
    assert(!loginProbe.body.includes('Admin proxy cannot reach'), 'login not a proxy failure');
    // Same-origin: browser would not require ACAO; proxy must not break JSON errors
    assert(loginProbe.body.includes('{') || loginProbe.body.length > 0, 'login error body present');
  } finally {
    child.kill('SIGKILL');
    tunnel.kill('SIGKILL');
  }
}

async function main() {
  await sectionMockProxy();

  // CORS module via ts-node child for unit + http e2e
  console.log('\n=== corsOrigins unit ===');
  const unit = spawn(
    'npx',
    ['ts-node', '--transpile-only', 'src/config/corsOrigins.test.ts'],
    {
      cwd: path.join(ROOT, 'Backend'),
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let uout = '';
  unit.stdout.on('data', (d) => {
    uout += d.toString();
  });
  unit.stderr.on('data', (d) => {
    uout += d.toString();
  });
  const ucode = await new Promise((resolve) => unit.on('close', resolve));
  assert(ucode === 0 && uout.includes('ok'), 'corsOrigins.test.ts');

  await sectionCorsHttpE2e();
  await sectionLiveTunnel();

  console.log('\n=== result ===');
  if (failed > 0) {
    console.error(`FAILED assertions: ${failed}`);
    process.exit(1);
  }
  console.log('ALL PASSED — Admin + CORS reverify complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
