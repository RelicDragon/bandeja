#!/usr/bin/env node
/**
 * Fetch Playtomic tenants for a country → loader JSON.
 *
 * 1) Prefer public API (when CloudFront WAF allows)
 * 2) Fallback: playtomic.com sitemap + /clubs/{slug} RSC tenant blob
 *
 * Usage:
 *   node Backend/scripts/fetch-playtomic-country.cjs GB uk-clubs.json
 *   node Backend/scripts/fetch-playtomic-country.cjs ES spain-clubs.json --force-web
 *   node Backend/scripts/fetch-playtomic-country.cjs --probe
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const API_BASE = 'https://api.playtomic.io/v1/tenants';
const SITE = 'https://playtomic.com';
const PAGE_SIZE = 100;
const WEB_CONCURRENCY = 4;
const WEB_DELAY_MS = 120;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function log(msg) {
  console.log(msg);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGet(url, { headers = {}, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: buf.toString('utf8'),
            buf,
          });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${url}`));
    });
    req.end();
  });
}

async function probeApi() {
  const url = `${API_BASE}?playtomic_status=ACTIVE&with_properties=true&size=1&page=0&country_code=ES`;
  const res = await httpGet(url, { headers: { Accept: 'application/json' } });
  const ok = res.status === 200 && (res.body.trim().startsWith('[') || res.body.trim().startsWith('{'));
  return { ok, status: res.status, snippet: res.body.slice(0, 120), total: res.headers.total || res.headers.Total };
}

async function fetchApiCountry(countryCode) {
  const clubs = [];
  let page = 0;
  let totalPages = 1;
  for (;;) {
    const url =
      `${API_BASE}?playtomic_status=ACTIVE&with_properties=true` +
      `&size=${PAGE_SIZE}&page=${page}&country_code=${encodeURIComponent(countryCode)}`;
    const res = await httpGet(url, { headers: { Accept: 'application/json' } });
    if (res.status !== 200) {
      throw new Error(`API HTTP ${res.status}: ${res.body.slice(0, 160)}`);
    }
    const data = JSON.parse(res.body);
    if (!Array.isArray(data)) throw new Error('API response is not an array');
    clubs.push(...data);
    const total = parseInt(String(res.headers.total || res.headers.Total || '0'), 10);
    if (total > 0) totalPages = Math.ceil(total / PAGE_SIZE);
    log(`[api] page ${page + 1}/${totalPages || '?'} +${data.length} have=${clubs.length} total=${total || '?'}`);
    page += 1;
    if (data.length === 0 || (total > 0 && page >= totalPages)) break;
    if (data.length < PAGE_SIZE && !total) break;
    await delay(200);
  }
  return clubs;
}

async function listClubSlugsFromSitemap() {
  const index = await httpGet(`${SITE}/sitemap.xml`);
  if (index.status !== 200) throw new Error(`sitemap index HTTP ${index.status}`);
  const maps = [...index.body.matchAll(/<loc>(https:\/\/playtomic\.com\/sitemap-clubs-\d+\.xml)<\/loc>/g)].map(
    (m) => m[1]
  );
  if (!maps.length) throw new Error('no club sitemaps found');
  const slugs = new Set();
  for (const mapUrl of maps) {
    const res = await httpGet(mapUrl);
    if (res.status !== 200) throw new Error(`sitemap HTTP ${res.status} ${mapUrl}`);
    for (const m of res.body.matchAll(/https:\/\/playtomic\.com\/clubs\/([a-z0-9\-]+)/g)) {
      slugs.add(m[1]);
    }
    log(`[web] sitemap ${mapUrl.split('/').pop()} unique_so_far=${slugs.size}`);
  }
  return [...slugs];
}

function extractTenantFromClubHtml(html) {
  const pushes = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)];
  for (const m of pushes) {
    let un;
    try {
      un = JSON.parse(`"${m[1]}"`);
    } catch {
      try {
        un = m[1]
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      } catch {
        continue;
      }
    }
    if (!un || (!un.includes('"tenant":{') && !un.includes('"tenant_id"'))) continue;
    const marker = '"tenant":{';
    let i = un.indexOf(marker);
    let start;
    if (i >= 0) start = un.indexOf('{', i + '"tenant":'.length);
    else {
      i = un.indexOf('{"tenant_id"');
      if (i < 0) continue;
      start = i;
    }
    let depth = 0;
    let end = -1;
    for (let j = start; j < un.length; j++) {
      const ch = un[j];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end < 0) continue;
    try {
      const tenant = JSON.parse(un.slice(start, end));
      if (tenant && tenant.tenant_id && tenant.tenant_name && tenant.address) return tenant;
    } catch {
      // keep looking
    }
  }
  return null;
}

function normalizeTenant(t) {
  const resources = Array.isArray(t.resources)
    ? t.resources.map((r) => ({
        resourceId: r.resourceId || r.resource_id,
        name: r.name,
        sport: r.sport || r.sport_id,
        features: r.features || [],
      }))
    : [];
  return {
    tenant_id: t.tenant_id,
    tenant_name: String(t.tenant_name || '').trim(),
    slug: t.slug,
    address: t.address,
    images: t.images || [],
    properties: t.properties || {},
    resources,
    opening_hours: t.opening_hours || {},
    sport_ids: t.sport_ids || [],
    description: t.description || '',
  };
}

async function fetchWebCountry(countryCode) {
  const want = countryCode.toUpperCase();
  const slugs = await listClubSlugsFromSitemap();
  log(`[web] ${slugs.length} club slugs; filtering country_code=${want}`);
  const out = [];
  let done = 0;
  let errors = 0;
  let idx = 0;

  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= slugs.length) return;
      const slug = slugs[i];
      try {
        const res = await httpGet(`${SITE}/clubs/${slug}`);
        if (res.status !== 200) {
          errors++;
        } else {
          const tenant = extractTenantFromClubHtml(res.body);
          if (tenant) {
            const cc = String(tenant.address?.country_code || '').toUpperCase();
            if (cc === want) out.push(normalizeTenant(tenant));
          } else {
            errors++;
          }
        }
      } catch {
        errors++;
      }
      done++;
      if (done % 100 === 0 || done === slugs.length) {
        log(`[web] ${done}/${slugs.length} matched=${out.length} errors=${errors}`);
      }
      await delay(WEB_DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: WEB_CONCURRENCY }, () => worker()));
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--probe')) {
    const p = await probeApi();
    log(JSON.stringify(p));
    process.exit(p.ok ? 0 : 2);
  }

  const forceWeb = args.includes('--force-web');
  const positional = args.filter((a) => !a.startsWith('-'));
  const countryCode = (positional[0] || '').toUpperCase();
  const outName = positional[1] || `${countryCode.toLowerCase()}-clubs.json`;
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    console.error('Usage: node fetch-playtomic-country.cjs <CC> [out.json] [--force-web|--probe]');
    process.exit(2);
  }

  const outDir = path.join(__dirname, '..', 'additions', 'playtomic', 'jsons');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.isAbsolute(outName) ? outName : path.join(outDir, outName);

  let clubs;
  let source = 'api';
  if (!forceWeb) {
    const p = await probeApi();
    log(`[probe] api ok=${p.ok} status=${p.status}`);
    if (p.ok) {
      clubs = await fetchApiCountry(countryCode);
    }
  }
  if (!clubs) {
    source = 'web-sitemap';
    clubs = await fetchWebCountry(countryCode);
  }

  // de-dupe by tenant_id
  const byId = new Map();
  for (const c of clubs) {
    if (c?.tenant_id) byId.set(c.tenant_id, c);
  }
  const rows = [...byId.values()];
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  log(`[done] source=${source} country=${countryCode} clubs=${rows.length} → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
