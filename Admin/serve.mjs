#!/usr/bin/env node
/**
 * Same-origin Admin UI + API proxy (loopback only).
 * Avoids file:// (Origin: null) and cross-origin CORS after #310.
 *
 *   ADMIN_API_TARGET=http://127.0.0.1:9000 node Admin/serve.mjs   # prod tunnel
 *   ADMIN_API_TARGET=http://127.0.0.1:3000 node Admin/serve.mjs   # local backend
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const PORT = Number(process.env.ADMIN_PORT || 9010);
const API_TARGET = (process.env.ADMIN_API_TARGET || 'http://127.0.0.1:9000').replace(/\/$/, '');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const rel = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.normalize(path.join(root, rel));
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

function proxyApi(req, res) {
  let targetUrl;
  try {
    targetUrl = new URL(req.url || '/', API_TARGET);
  } catch {
    send(res, 502, 'Bad API target');
    return;
  }

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!key || HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (value === undefined) continue;
    headers[key] = value;
  }
  headers.host = targetUrl.host;

  const upstream = http.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers,
    },
    (upRes) => {
      const outHeaders = {};
      for (const [key, value] of Object.entries(upRes.headers)) {
        if (!key || HOP_BY_HOP.has(key.toLowerCase())) continue;
        outHeaders[key] = value;
      }
      res.writeHead(upRes.statusCode || 502, outHeaders);
      upRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    console.error('[admin-serve] proxy error:', err.message);
    if (!res.headersSent) {
      send(
        res,
        502,
        JSON.stringify({
          success: false,
          message: `Admin proxy cannot reach ${API_TARGET} (${err.message}). Is the tunnel or local backend up?`,
        }),
        { 'Content-Type': 'application/json; charset=utf-8' }
      );
    } else {
      res.destroy();
    }
  });

  req.pipe(upstream);
}

function serveStatic(req, res) {
  const filePath = safeJoin(__dirname, req.url || '/');
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      send(res, 404, 'Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url === '/__admin_serve_health') {
    send(
      res,
      200,
      JSON.stringify({ ok: true, apiTarget: API_TARGET, bind: `${HOST}:${PORT}` }),
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    );
    return;
  }
  if (url.startsWith('/api')) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.on('error', (err) => {
  console.error(`[admin-serve] ${err.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Admin UI  http://${HOST}:${PORT}/`);
  console.log(`API proxy /api → ${API_TARGET}`);
  console.log('Use login API URL: /api (same-origin)');
});
