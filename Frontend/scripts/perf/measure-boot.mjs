#!/usr/bin/env node
// Boot + tab-switch performance harness (production bundle, phone-like CPU).
//
//   PERF_BASE_URL=http://localhost:4173 PERF_TOKEN=<access jwt> \
//     ../scripts/run-heavy node scripts/perf/measure-boot.mjs
//
// Serve a prod build that talks to the local backend first, e.g.
//   VITE_API_BASE_URL=http://localhost:3000/api vite build --outDir /tmp/padel-perf-dist
//   vite preview --outDir /tmp/padel-perf-dist --port 4173   (preview proxies /api like dev)
//
// Env: PERF_CPU_THROTTLE (default 4), PERF_RUNS (default 3), PERF_OUT (JSON report path).
/* global window, document, location, MutationObserver, requestAnimationFrame -- page.evaluate / init-script bodies run in the browser */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = process.env.PERF_BASE_URL || 'http://localhost:4173';
const TOKEN = process.env.PERF_TOKEN || '';
const CPU = Number(process.env.PERF_CPU_THROTTLE || 4);
const RUNS = Number(process.env.PERF_RUNS || 3);
const OUT = process.env.PERF_OUT || '';

const INIT = () => {
  window.__perf = { longTasks: [], lcp: 0, mutations: 0, lastMutation: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__perf.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]);
  }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__perf.lcp = Math.round(e.startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  const start = () => {
    new MutationObserver((m) => {
      window.__perf.mutations += m.length;
      window.__perf.lastMutation = performance.now();
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  };
  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start);
};

async function newSession(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (TOKEN) {
    await context.addInitScript((token) => {
      if (!sessionStorage.getItem('__perfSeeded')) {
        localStorage.setItem('token', token);
        localStorage.removeItem('auth_explicit_logout_at');
        sessionStorage.setItem('__perfSeeded', '1');
      }
    }, TOKEN);
  }
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await cdp.send('Network.enable');
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, type: e.type, t0: e.timestamp, from: e.initiator?.type }));
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.fromCache = e.response.fromDiskCache || e.response.fromServiceWorker; } });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.t1 = e.timestamp; r.bytes = e.encodedDataLength; } });
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.t1 = e.timestamp; r.failed = true; } });
  return { context, page, cdp, reqs };
}

async function waitSettled(page, reqs, { quietMs = 800, timeoutMs = 10000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    await page.waitForTimeout(100);
    const pending = [...reqs.values()].filter((r) => r.t1 === undefined && r.type !== 'WebSocket' && r.type !== 'EventSource' && !r.url.includes('/socket.io/') && !r.url.includes('.worker-'));
    const sinceMut = await page.evaluate(() => performance.now() - (window.__perf?.lastMutation || 0));
    if (pending.length === 0 && sinceMut > quietMs) return Date.now() - t0 - quietMs;
    if (Date.now() - t0 > timeoutMs) {
      console.error('[perf] not settled:', pending.length ? pending.map((r) => r.url.slice(0, 120)) : `DOM still mutating (${Math.round(sinceMut)}ms quiet)`);
      return -1;
    }
  }
}

function summarizeRequests(reqs, navStart) {
  const all = [...reqs.values()].filter((r) => r.t1 !== undefined);
  const api = all.filter((r) => r.url.includes('/api/')).map((r) => ({
    url: r.url.replace(/^https?:\/\/[^/]+/, '').replace(/([?&])_t=\d+&?/, '$1').slice(0, 110),
    start: Math.round((r.t0 - navStart) * 1000),
    ms: Math.round((r.t1 - r.t0) * 1000),
    kb: Math.round((r.bytes || 0) / 1024),
    status: r.status,
  })).sort((a, b) => a.start - b.start);
  const js = all.filter((r) => r.type === 'Script');
  const dupes = {};
  for (const a of api) { const k = a.url.split('?')[0]; dupes[k] = (dupes[k] || 0) + 1; }
  return {
    jsFiles: js.length,
    jsKB: Math.round(js.reduce((s, r) => s + (r.bytes || 0), 0) / 1024),
    totalKB: Math.round(all.reduce((s, r) => s + (r.bytes || 0), 0) / 1024),
    apiCount: api.length,
    apiDuplicates: Object.fromEntries(Object.entries(dupes).filter(([, n]) => n > 1)),
    api,
  };
}

async function measureLoad(page, reqs, label) {
  reqs.clear();
  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'), null, { timeout: 60000 }).catch(() => {});
  const appReady = Date.now() - t0;
  await page.waitForSelector('[role="navigation"] button', { timeout: 60000 }).catch(() => {});
  const tabBar = Date.now() - t0;
  const settledAfter = await waitSettled(page, reqs);
  const settled = settledAfter < 0 ? -1 : Date.now() - t0 - 800;
  const metrics = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint');
    const nav = performance.getEntriesByType('navigation')[0];
    const lts = window.__perf.longTasks;
    return {
      fcp: p ? Math.round(p.startTime) : null,
      lcp: window.__perf.lcp,
      dcl: Math.round(nav.domContentLoadedEventEnd),
      longTasks: lts.length,
      longTaskMs: lts.reduce((s, [, d]) => s + d, 0),
      tbt: lts.reduce((s, [, d]) => s + Math.max(0, d - 50), 0),
      worstLongTasks: [...lts].sort((a, b) => b[1] - a[1]).slice(0, 5),
      heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576),
      domNodes: document.getElementsByTagName('*').length,
      url: location.pathname,
    };
  });
  const navStart = Math.min(...[...reqs.values()].map((r) => r.t0));
  return { label, appReady, tabBar, settled, ...metrics, net: summarizeRequests(reqs, navStart) };
}

async function measureTabs(page, reqs) {
  const labels = await page.$$eval('[role="navigation"] button', (bs) => bs.map((b) => b.getAttribute('aria-label')));
  const out = [];
  for (const pass of [1, 2]) {
    for (let i = 0; i < labels.length; i++) {
      reqs.clear();
      await page.evaluate(() => { window.__perf.longTasks = []; });
      console.error(`[perf] tab ${labels[i]} pass ${pass}`);
      const t0 = Date.now();
      const firstChange = page.evaluate(() => new Promise((res) => {
        const s = performance.now();
        const o = new MutationObserver(() => { o.disconnect(); requestAnimationFrame(() => res(Math.round(performance.now() - s))); });
        o.observe(document.body, { subtree: true, childList: true });
        setTimeout(() => { o.disconnect(); res(-1); }, 5000);
      }));
      await page.locator('[role="navigation"] button').nth(i).click();
      const firstPaint = await firstChange;
      const settleMs = await waitSettled(page, reqs, { quietMs: 600 });
      const lt = await page.evaluate(() => window.__perf.longTasks);
      out.push({
        pass, tab: labels[i], firstPaint, settled: settleMs < 0 ? -1 : settleMs, wall: Date.now() - t0,
        longTaskMs: lt.reduce((s, [, d]) => s + d, 0), worstLongTask: Math.max(0, ...lt.map(([, d]) => d)),
        api: [...reqs.values()].filter((r) => r.url.includes('/api/')).map((r) => r.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]),
      });
    }
  }
  return out;
}

const browser = await chromium.launch();
const report = { base: BASE, cpuThrottle: CPU, at: new Date().toISOString(), cold: [], warm: [], tabs: null };
for (let i = 0; i < RUNS; i++) {
  const s = await newSession(browser);
  report.cold.push(await measureLoad(s.page, s.reqs, `cold#${i + 1}`));
  report.warm.push(await measureLoad(s.page, s.reqs, `warm#${i + 1}`));
  if (i === 0) report.tabs = await measureTabs(s.page, s.reqs);
  await s.context.close();
}
await browser.close();

const med = (xs) => { const s = xs.filter((x) => x != null && x >= 0).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const row = (runs) => Object.fromEntries(['fcp', 'lcp', 'appReady', 'tabBar', 'settled', 'longTaskMs', 'tbt', 'heapMB', 'domNodes'].map((k) => [k, med(runs.map((r) => r[k]))]));
console.log(JSON.stringify({ cold: row(report.cold), warm: row(report.warm), coldNet: { jsKB: report.cold[0].net.jsKB, jsFiles: report.cold[0].net.jsFiles, totalKB: report.cold[0].net.totalKB, apiCount: report.cold[0].net.apiCount, dupes: report.cold[0].net.apiDuplicates } }, null, 2));
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2));
