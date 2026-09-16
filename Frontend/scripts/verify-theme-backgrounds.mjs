import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const css = ['tokens', 'base', 'premium-navigation'].map(name => readFileSync(new URL(`../src/styles/${name}.css`, import.meta.url), 'utf8')).join('\n');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootCss = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`<style>${bootCss}\n${css}</style><div id="root"></div>`);
  for (const [classes, expected] of [
    ['app-ready', 'rgb(249, 250, 251)'],
    ['app-ready dark', 'rgb(17, 24, 39)'],
    ['app-ready premium-theme', 'rgb(250, 249, 246)'],
    ['app-ready premium-theme dark', 'rgb(20, 20, 17)'],
    ['app-ready', 'rgb(249, 250, 251)'],
    ['premium-theme dark', 'rgb(20, 20, 17)'],
  ]) {
    await page.evaluate(value => { globalThis.document.documentElement.className = value; }, classes);
    const colors = await page.evaluate(() => ['html', 'body', '#root'].map(selector => globalThis.getComputedStyle(globalThis.document.querySelector(selector)).backgroundColor));
    assert.deepEqual(colors, [expected, expected, expected], classes);
  }
  const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  await page.route('https://theme.test/**', route => route.fulfill({ contentType: 'text/html', body: `<script>${bootstrap}</script><style>${bootCss}\n${css}</style><div id="boot-splash"></div><div id="root"></div>` }));
  for (const premium of [false, true]) {
    for (const theme of ['light', 'dark', 'system']) {
      for (const os of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: os });
        await page.goto('https://theme.test/');
        await page.evaluate(({ theme, premium }) => {
          localStorage.setItem('theme', theme);
          localStorage.setItem('user', JSON.stringify({ isPremium: true, mainTheme: premium ? 'premium' : 'classic' }));
        }, { theme, premium });
        await page.reload();
        const dark = theme === 'dark' || (theme === 'system' && os === 'dark');
        const expected = premium ? (dark ? 'rgb(20, 20, 17)' : 'rgb(250, 249, 246)') : (dark ? 'rgb(17, 24, 39)' : 'rgb(249, 250, 251)');
        const colors = await page.evaluate(() => ['html', 'body', '#root', '#boot-splash'].map(selector => globalThis.getComputedStyle(globalThis.document.querySelector(selector)).backgroundColor));
        assert.deepEqual(colors, Array(4).fill(expected), `${premium ? 'Premium' : 'Classic'} ${theme} (OS ${os})`);
      }
    }
  }
  console.log('Backgrounds, switching and first paint pass all 12 preference/OS combinations.');
} finally { await browser.close(); }
