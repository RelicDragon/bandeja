import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(`${root}/src/components/PlayerAvatar.css`, 'utf8');
const framesCss = readFileSync(`${root}/src/styles/collection.css`, 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.setContent(`
    <html class="dark"><style>
      body { margin: 0; background: #111827; }
      .roster { display: flex; gap: 24px; padding: 24px; }
      button { position: relative; width: 48px; height: 48px; border: 0; border-radius: 50%; background: #2563eb; }
      .face { position: absolute; inset: 0; border-radius: inherit; background: #475569; }
      .dot { position: absolute; right: 0; top: 0; width: 8px; height: 8px; border-radius: 50%; background: #2563eb; z-index: 10; }
      ${css}
      ${framesCss}
    </style><body>
      ${Array.from({ length: 12 }, () => `<div class="roster">
        ${['', '-trainer', '-favorite'].map(kind => `<button class="avatar-online-border${kind} collection-frame collection-frame-gold" aria-label="Open player">
          <span class="face"></span><span class="dot avatar-online-dot${kind}"></span>
        </button>`).join('')}
      </div>`).join('')}
    </body></html>
  `);
  const cdp = await page.context().newCDPSession(page);
  let layers = [];
  cdp.on('LayerTree.layerTreeDidChange', event => { layers = event.layers || []; });
  await cdp.send('LayerTree.enable');
  // Let initial rasterization finish, then sample real frames with motion running.
  await page.screenshot();
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
  const before = new Map(layers.map(layer => [layer.layerId, layer.paintCount]));
  assert(before.size > 0, 'Chrome must expose paint counts');
  for (let frame = 0; frame < 20; frame++) {
    await page.screenshot();
  }
  const idlePaints = Math.max(0, ...layers.map(layer => layer.paintCount - (before.get(layer.layerId) ?? 0)));
  console.log(`Maximum extra paints per layer across 20 idle frames: ${idlePaints}`);
  assert(idlePaints <= 2, 'Online presence must pulse without continuously repainting cards while idle');

  const motion = await page.evaluate(() => {
    const animations = globalThis.document.getAnimations();
    return animations.map(animation => ({
      state: animation.playState,
      duration: animation.effect.getTiming().duration,
    }));
  });
  assert.equal(motion.length, 72, 'Every online ring and dot must retain its pulse');
  assert(motion.every(animation => animation.state === 'running' && animation.duration === 2000));

  for (const dark of [false, true]) {
    await page.evaluate(dark => globalThis.document.documentElement.classList.toggle('dark', dark), dark);
    const colors = await page.locator('.roster').first().locator('button').evaluateAll(buttons =>
      buttons.map(button => ({
        ring: globalThis.getComputedStyle(button).boxShadow,
        halo: globalThis.getComputedStyle(button, '::before').boxShadow,
        frame: globalThis.getComputedStyle(button, '::after').backgroundImage,
        interactive: globalThis.getComputedStyle(button, '::before').pointerEvents,
      })));
    const expected = dark ? ['96, 165, 250', '74, 222, 128', '250, 204, 21'] : ['59, 130, 246', '34, 197, 94', '234, 179, 8'];
    colors.forEach((color, index) => {
      assert(color.ring.includes(expected[index]) && color.halo.includes(expected[index]), 'Keep normal, trainer and favorite colors in both themes');
      assert(color.frame.includes('conic-gradient'), 'Presence must not replace collection frames');
      assert.equal(color.interactive, 'none', 'Glow must not intercept avatar controls');
    });
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => globalThis.document.getAnimations().length), 0, 'Reduced motion must freeze the pulse');
  const ring = await page.locator('button').first().evaluate(button => globalThis.getComputedStyle(button).boxShadow);
  assert.notEqual(ring, 'none', 'Online status must remain visible without motion');
  console.log('Presence pulses, colors, collection frames and reduced motion are preserved.');
} finally {
  await browser.close();
}
