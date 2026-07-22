#!/usr/bin/env node
/**
 * Reverify Admin/serve.mjs: static + /api proxy (loopback mock upstream).
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function fetchText(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers: opts.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers,
          });
        });
      }
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
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
        });
        res.end(
          JSON.stringify({
            ok: true,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
      });
      return;
    }
    res.writeHead(404);
    res.end('no');
  });
  const upstreamPort = await listen(upstream);

  const serveServer = http.createServer(); // placeholder to pick free port
  const servePort = await listen(serveServer);
  serveServer.close();

  const child = spawn(
    process.execPath,
    [path.join(__dirname, 'serve.mjs')],
    {
      env: {
        ...process.env,
        ADMIN_PORT: String(servePort),
        ADMIN_API_TARGET: `http://127.0.0.1:${upstreamPort}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let boot = '';
  child.stdout.on('data', (d) => {
    boot += d.toString();
  });
  child.stderr.on('data', (d) => {
    boot += d.toString();
  });

  for (let i = 0; i < 50; i++) {
    try {
      const h = await fetchText(`http://127.0.0.1:${servePort}/__admin_serve_health`);
      if (h.status === 200) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  try {
    const health = await fetchText(`http://127.0.0.1:${servePort}/__admin_serve_health`);
    assert(health.status === 200, 'serve health');
    assert(health.body.includes('"ok":true'), 'serve health body');

    const index = await fetchText(`http://127.0.0.1:${servePort}/`);
    assert(index.status === 200, 'index.html');
    assert(index.body.includes('Bandeja Admin'), 'index title');
    assert(index.body.includes('file://'), 'file protocol guard present');

    const appJs = await fetchText(`http://127.0.0.1:${servePort}/app.js`);
    assert(appJs.status === 200, 'app.js');
    assert(appJs.body.includes('blockFileProtocolAdmin'), 'file guard in app.js');

    const proxied = await fetchText(`http://127.0.0.1:${servePort}/api/health`);
    assert(proxied.status === 200, 'proxy /api/health status');
    assert(proxied.body.includes('"via":"upstream"'), 'proxy reaches upstream');

    const body = JSON.stringify({ ping: 1 });
    const echoed = await fetchText(`http://127.0.0.1:${servePort}/api/echo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    });
    assert(echoed.status === 200, `proxy POST status=${echoed.status} body=${echoed.body}`);
    const echoedJson = JSON.parse(echoed.body);
    assert(echoedJson.ok === true, 'proxy POST ok');
    assert(echoedJson.body === '{"ping":1}', `proxy forwards body: ${echoedJson.body}`);
    assert(echoed.headers['x-echo-auth'] === 'Bearer test-token', 'proxy forwards Authorization');

    console.log('Admin/serve.verify.mjs: ok');
  } finally {
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    upstream.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
