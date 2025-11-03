// =======================
// PART 1 — Cloudflare Worker (index.js)
// =======================

const UPSTREAM = 'https://app.lundapadel.ru/api';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
]);

function filterHeaders(src) {
  const dst = new Headers();
  for (const [k, v] of src.entries()) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(key)) continue;
    if (key === 'accept-encoding') continue;
    dst.set(k, v);
  }
  return dst;
}

export default {
  async fetch(req) {
    const url = new URL(req.url);

    if (!url.pathname.startsWith('/api/lunda/')) {
      return new Response('Not found', { status: 404 });
    }

    const upstreamPath = url.pathname.replace('/api/lunda', '');
    const upstreamUrl = new URL(UPSTREAM + upstreamPath + url.search);

    const init = {
      method: req.method,
      headers: filterHeaders(req.headers),
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      redirect: 'manual',
    };

    const upstreamResp = await fetch(upstreamUrl.toString(), init);

    const respHeaders = new Headers();
    for (const [k, v] of upstreamResp.headers.entries()) {
      if (HOP_BY_HOP_HEADERS.has(k.toLowerCase())) continue;
      // Forward multiple Set-Cookie headers individually
      respHeaders.append(k, v);
    }

    // Uncomment for CORS if needed
    // respHeaders.set('Access-Control-Allow-Origin', '*');
    // respHeaders.set('Access-Control-Allow-Headers', '*');
    // respHeaders.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers: respHeaders,
    });
  },
};