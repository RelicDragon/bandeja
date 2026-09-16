import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const texture = readFileSync(`${root}/src/assets/premium/obsidian-gold-stone.webp`).toString('base64');
const css = readFileSync(process.argv[2] || `${root}/src/styles/premium-navigation.css`, 'utf8')
  .replace("url('../assets/premium/obsidian-gold-stone.webp')", `url(data:image/webp;base64,${texture})`);
const browser = await chromium.launch({ headless: true });

try {
  // Isolate the real header CSS from React and network activity. High-contrast
  // content moves beneath the fixed header at Chrome's mobile viewport size.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  await page.setContent(`
    <style>
      body { margin: 0; background: #141411; }
      header { position: fixed; inset: 0 0 auto; height: 112px; z-index: 40; }
      .app-header-controls { display: flex; align-items: center; padding: 0 16px; }
      .content { height: 4000px; background: repeating-linear-gradient(#fff 0 100px, #111 100px 200px); }
      ${css}
    </style>
    <div class="premium-shell">
      <header class="premium-header">
        <div class="premium-header-stone"><div class="premium-header-stone-edges"></div></div>
        <button class="premium-brand"><span class="premium-brand-name">Bandeja</span></button>
        <div class="app-header-controls">Calendar</div>
      </header>
      <div class="content"></div>
    </div>
  `);
  // Freeze intentional motion to isolate scroll-induced rasterization.
  await page.evaluate(() => {
    for (const animation of globalThis.document.getAnimations()) {
      animation.pause();
      animation.currentTime = 4000;
    }
  });
  const cdp = await page.context().newCDPSession(page);
  let layers = [];
  cdp.on('LayerTree.layerTreeDidChange', event => { layers = event.layers || []; });
  await cdp.send('LayerTree.enable');
  await page.screenshot();
  const clip = { x: 0, y: 0, width: 390, height: 112 };
  const baseline = await page.screenshot({ clip });
  const initialPaintCounts = new Map(layers.map(layer => [layer.layerId, layer.paintCount]));
  assert(initialPaintCounts.size > 0, 'Chrome must expose layers for the rasterization check');

  for (let index = 1; index <= 8; index++) {
    await page.evaluate(y => globalThis.scrollTo(0, y), index * 67);
    const frame = await page.screenshot({ clip });
    assert(frame.equals(baseline), 'Scrolling must not alter the frozen header image');
  }
  const extraPaints = layers
    .filter(layer => layer.drawsContent && layer.height < 200)
    .map(layer => (layer.paintCount || 0) - (initialPaintCounts.get(layer.layerId) || 0));
  assert(Math.max(0, ...extraPaints) <= 1, `Header layers repaint during scroll: ${extraPaints.join(', ')}`);

  await page.evaluate(async () => {
    const animations = globalThis.document.getAnimations();
    for (const animation of animations) animation.play();
    await Promise.all(animations.map(animation => animation.ready));
  });
  const starts = await page.evaluate(() => globalThis.document.getAnimations().map(animation => animation.startTime));
  assert.equal(starts.length, 2, 'Both stone drift and light sweep must remain active');
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  await page.screenshot();
  assert.deepEqual(
    await page.evaluate(() => globalThis.document.getAnimations().map(animation => animation.startTime)),
    starts,
    'Scrolling must not restart the stone animation',
  );
  console.log('Premium header stays visually stable without repeated rasterization during scroll; animation continues.');
} finally {
  await browser.close();
}
