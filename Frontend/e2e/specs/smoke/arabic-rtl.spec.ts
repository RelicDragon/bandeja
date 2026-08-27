import { test, expect } from '@playwright/test';

test.describe('arabic rtl smoke', () => {
  test('guest login shell is RTL with Arabic chrome', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('language', 'ar');
    });
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { name: /bandeja/i })).toBeVisible();
    const bodyFont = await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily);
    expect(bodyFont.toLowerCase()).toContain('cairo');
  });

  test('switching language via localStorage applies LTR again', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('language', 'ar');
    });
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.evaluate(() => {
      localStorage.setItem('language', 'en');
    });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});
