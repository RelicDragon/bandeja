import { test, expect } from '@playwright/test';
import { SelectCityPage } from '../../pages/select-city.page';
import { ShellPage } from '../../pages/shell.page';
import { seedAuthInBrowser } from '../../fixtures/storage.fixture';
import { createNoCityUser, listCities } from '../../fixtures/persona.fixture';

test.describe('auth select city', () => {
  test('A-17 new user no city', async ({ page }) => {
    const { token, user } = await createNoCityUser();
    await seedAuthInBrowser(page, token, user);
    await page.goto('/select-city');
    await new SelectCityPage(page).expectLoaded();
  });

  test('A-18 city already set @auth', async ({ page }) => {
    await page.goto('/select-city');
    await expect(page).toHaveURL((url) => url.pathname === '/' || url.pathname === '');
  });

  test('A-19 pick city', async ({ page }) => {
    const { token, user } = await createNoCityUser();
    const cities = await listCities(token);
    test.skip(cities.length === 0, 'No cities seeded');

    await seedAuthInBrowser(page, token, user);
    const selectCity = new SelectCityPage(page);
    await selectCity.goto();
    await selectCity.expectLoaded();
    const cityButton = page.locator('button').filter({ hasText: new RegExp(cities[0]!.name, 'i') }).first();
    if (await cityButton.isVisible()) {
      await cityButton.click();
    }
    await page.getByRole('button', { name: /^confirm$/i }).click();
    await new ShellPage(page).expectAuthenticatedHome();
  });
});
