#!/usr/bin/env node
// CPU-profile one tab switch and print the hottest functions (self + total time).
//
//   PERF_BASE_URL=http://localhost:3001 PERF_TOKEN=<jwt> PERF_TAB=Chats \
//     ../scripts/run-heavy node scripts/perf/profile-action.mjs
//
// Use the dev server (readable names) or a sourcemapped build. PERF_PROFILE_OUT saves
// the raw .cpuprofile for Chrome DevTools.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = process.env.PERF_BASE_URL || 'http://localhost:3001';
const TOKEN = process.env.PERF_TOKEN || '';
const TAB = process.env.PERF_TAB || 'Chats';
const CPU = Number(process.env.PERF_CPU_THROTTLE || 4);
const OUT = process.env.PERF_PROFILE_OUT || '';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addInitScript((token) => {
  if (token && !sessionStorage.getItem('__perfSeeded')) {
    localStorage.setItem('token', token);
    localStorage.removeItem('auth_explicit_logout_at');
    sessionStorage.setItem('__perfSeeded', '1');
  }
}, TOKEN);
const page = await context.newPage();
await page.goto(BASE + '/');
await page.waitForSelector('[role="navigation"] button', { timeout: 120000 });
await page.waitForTimeout(8000);

const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const t0 = Date.now();
await page.getByRole('navigation').getByRole('button', { name: TAB, exact: true }).click();
await page.waitForTimeout(Number(process.env.PERF_WINDOW_MS || 8000));
const { profile } = await cdp.send('Profiler.stop');
console.error(`[profile] ${TAB} window ${Date.now() - t0}ms`);
if (OUT) writeFileSync(OUT, JSON.stringify(profile));

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const dt = profile.timeDeltas;
const selfUs = new Map();
profile.samples.forEach((id, i) => selfUs.set(id, (selfUs.get(id) || 0) + (dt[i] || 0)));

const key = (n) => {
  const f = n.callFrame;
  const file = f.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
  return `${f.functionName || '(anon)'} ${file}:${f.lineNumber + 1}`;
};
const self = new Map();
const total = new Map();
for (const [id, us] of selfUs) {
  const n = byId.get(id);
  const k = key(n);
  self.set(k, (self.get(k) || 0) + us);
  const seen = new Set();
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const kk = key(byId.get(cur));
    if (seen.has(kk)) continue;
    seen.add(kk);
    total.set(kk, (total.get(kk) || 0) + us);
  }
}
const top = (m, n, filter = () => true) => [...m.entries()].filter(([k]) => filter(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `${String(Math.round(us / 1000)).padStart(6)}ms  ${k}`);
const isApp = (k) => k.includes('/src/') && !k.includes('node_modules');
console.log('== self time (all) ==\n' + top(self, 25).join('\n'));
console.log('\n== total time (app code) ==\n' + top(total, 40, isApp).join('\n'));
await browser.close();
