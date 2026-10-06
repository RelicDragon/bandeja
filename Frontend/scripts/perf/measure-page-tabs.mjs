#!/usr/bin/env node
/* global window, document, location, MutationObserver -- page.evaluate / init-script bodies run in the browser */
// Open one page (cold), then click through its in-page tabs and report, per switch:
// time until the DOM settles, long tasks, and every API request with size and duration.
//
//   PERF_BASE_URL=http://localhost:4173 PERF_TOKEN=<jwt> PERF_PATH=/games/<seasonId> \
//   PERF_TABS="Schedule,Standings,General,Schedule,Standings" \
//     ../scripts/run-heavy node scripts/perf/measure-page-tabs.mjs
//
// Tabs are buttons matched by aria-label / title / text in the top 200px.
// Env: PERF_CPU_THROTTLE (default 4), PERF_VIEWPORT (default 1280x900), PERF_OUT (JSON).
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = process.env.PERF_BASE_URL || 'http://localhost:4173';
const TOKEN = process.env.PERF_TOKEN || '';
const PATH = process.env.PERF_PATH || '/';
const TABS = (process.env.PERF_TABS || '').split(',').map((s) => s.trim()).filter(Boolean);
const CPU = Number(process.env.PERF_CPU_THROTTLE || 4);
const [VW, VH] = (process.env.PERF_VIEWPORT || '1280x900').split('x').map(Number);
const OUT = process.env.PERF_OUT || '';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: VW, height: VH } });
await context.addInitScript((token) => {
  if (token && !sessionStorage.getItem('__perfSeeded')) {
    localStorage.setItem('token', token);
    localStorage.removeItem('auth_explicit_logout_at');
    sessionStorage.setItem('__perfSeeded', '1');
  }
  window.__perf = { longTasks: [], lastMutation: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__perf.longTasks.push(e.duration);
  }).observe({ type: 'longtask', buffered: true });
  const watch = () =>
    new MutationObserver(() => {
      window.__perf.lastMutation = performance.now();
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  if (document.documentElement) watch();
  else document.addEventListener('DOMContentLoaded', watch);
}, TOKEN);

const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await cdp.send('Network.enable');
const reqs = new Map();
cdp.on('Network.requestWillBeSent', (e) => {
  if (e.request.url.includes('/api/')) reqs.set(e.requestId, { url: e.request.url, t0: e.timestamp });
});
cdp.on('Network.loadingFinished', (e) => {
  const r = reqs.get(e.requestId);
  if (r) Object.assign(r, { t1: e.timestamp, bytes: e.encodedDataLength });
});
cdp.on('Network.loadingFailed', (e) => {
  const r = reqs.get(e.requestId);
  if (r) Object.assign(r, { t1: e.timestamp, failed: true });
});
cdp.on('Network.dataReceived', (e) => {
  const r = reqs.get(e.requestId);
  if (r) r.decoded = (r.decoded || 0) + e.dataLength;
});

const short = (url) => url.replace(/^https?:\/\/[^/]+\/api\//, '').replace(/([?&])_t=\d+&?/, '$1').replace(/[?&]$/, '').slice(0, 90);

async function settle(quietMs = 700, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    await page.waitForTimeout(100);
    const pending = [...reqs.values()].filter((r) => r.t1 === undefined && !r.url.includes('/socket.io/')).length;
    const quiet = await page.evaluate(() => performance.now() - (window.__perf?.lastMutation ?? 0));
    if (pending === 0 && quiet > quietMs) return Date.now() - start - quietMs;
    if (Date.now() - start > timeoutMs) return -1;
  }
}

async function step(label, action) {
  reqs.clear();
  await page.evaluate(() => {
    if (window.__perf) window.__perf.longTasks = [];
  });
  const t0 = Date.now();
  await action();
  const settledAfter = await settle();
  const lts = await page.evaluate(() => window.__perf?.longTasks ?? []);
  return {
    step: label,
    settledMs: settledAfter < 0 ? -1 : Date.now() - t0 - 700,
    longTaskMs: Math.round(lts.reduce((s, d) => s + d, 0)),
    worstLongTask: Math.round(Math.max(0, ...lts)),
    api: [...reqs.values()].map((r) => ({
      url: short(r.url),
      ms: r.t1 ? Math.round((r.t1 - r.t0) * 1000) : null,
      wireKB: Math.round((r.bytes || 0) / 1024),
      jsonKB: Math.round((r.decoded || 0) / 1024),
    })),
  };
}

const results = [];
results.push(
  await step(`open ${PATH}`, async () => {
    await page.goto(BASE + PATH, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'), null, { timeout: 60000 });
  }),
);
for (const tab of TABS) {
  const findTab = (label) => {
    const match = [...document.querySelectorAll('button')].find(
      (b) => (b.getAttribute('aria-label') || b.title || b.innerText).trim() === label && b.getBoundingClientRect().top < 260,
    );
    return Boolean(match);
  };
  const found = await page.waitForFunction(findTab, tab, { timeout: 15000 }).then(() => true, () => false);
  if (!found) {
    const seen = await page.evaluate(() => ({
      url: location.pathname + location.search,
      buttons: [...document.querySelectorAll('button')].slice(0, 25).map((b) => (b.getAttribute('aria-label') || b.title || b.innerText).trim().slice(0, 24)),
    }));
    throw new Error(`tab not found: ${tab} ${JSON.stringify(seen)}`);
  }
  results.push(
    await step(tab, () =>
      page.evaluate((label) => {
        [...document.querySelectorAll('button')]
          .find((b) => (b.getAttribute('aria-label') || b.title || b.innerText).trim() === label && b.getBoundingClientRect().top < 260)
          .click();
      }, tab),
    ),
  );
}
await browser.close();

for (const r of results) {
  const kb = r.api.reduce((s, a) => s + a.jsonKB, 0);
  console.log(`${r.step.padEnd(28)} settled=${String(r.settledMs).padStart(6)}ms  longTasks=${String(r.longTaskMs).padStart(5)}ms (worst ${r.worstLongTask})  api=${r.api.length} json=${kb}KB`);
  for (const a of r.api.filter((x) => x.jsonKB >= 20 || /leagues|results/.test(x.url))) {
    console.log(`    ${String(a.ms).padStart(5)}ms ${String(a.jsonKB).padStart(5)}KB  ${a.url}`);
  }
}
if (OUT) writeFileSync(OUT, JSON.stringify({ base: BASE, path: PATH, cpuThrottle: CPU, results }, null, 2));
