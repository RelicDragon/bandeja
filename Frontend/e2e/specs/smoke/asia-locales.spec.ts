import { test, expect } from '@playwright/test';

const ASIA_LOCALES = ['zh', 'id', 'hi', 'th', 'ja'] as const;

const FONT_EXPECTATIONS: Record<(typeof ASIA_LOCALES)[number], RegExp> = {
  zh: /noto sans sc|pingfang|yahei|hiragino sans gb/,
  id: /segoe ui|roboto|system|apple/,
  hi: /noto sans devanagari|kohinoor|mangal/,
  th: /noto sans thai|thonburi|leelawadee/,
  ja: /noto sans jp|hiragino|yu gothic|meiryo/,
};

test.describe('asia locales smoke', () => {
  for (const code of ASIA_LOCALES) {
    test(`guest login shell uses lang=${code}`, async ({ page }) => {
      await page.addInitScript((lang) => {
        localStorage.setItem('language', lang);
      }, code);
      await page.goto('/login');
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      await expect(page.getByRole('heading', { name: /bandeja/i })).toBeVisible();
    });
  }

  for (const code of ASIA_LOCALES) {
    if (code === 'id') continue;
    test(`${code} uses expected font stack`, async ({ page }) => {
      await page.addInitScript((lang) => {
        localStorage.setItem('language', lang);
      }, code);
      await page.goto('/login');
      const bodyFont = await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily);
      expect(bodyFont.toLowerCase()).toMatch(FONT_EXPECTATIONS[code]);
    });
  }

  test('switching from zh to en restores default LTR chrome', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('language', 'zh');
    });
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
    await page.evaluate(() => {
      localStorage.setItem('language', 'en');
    });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});
