import { test, expect } from '@playwright/test';
import { SelectCityPage } from '../../pages/select-city.page';
import { ShellPage } from '../../pages/shell.page';
import { OnboardingPage } from '../../pages/onboarding.page';
import { seedAuthInBrowser } from '../../fixtures/storage.fixture';
import { createCityPromptUser, createNoCityUser, listCities } from '../../fixtures/persona.fixture';

test.describe.configure({ mode: 'serial' });

test.describe('auth select city', () => {
  test('A-17 new user no city', async ({ page }) => {
    const { token, user } = await createCityPromptUser();
    await seedAuthInBrowser(page, token, user);

    await page.goto('/');
    await expect(new OnboardingPage(page).cityPromptBanner()).toBeVisible({ timeout: 20_000 });

    await page.goto('/select-city');
    await expect(page).toHaveURL((url) => url.pathname === '/' || url.pathname === '');
    await expect(new SelectCityPage(page).heading()).toHaveCount(0);
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
    const target = cities.find((c) => c.name === 'Belgrade') ?? cities[0]!;
    await selectCity.pickCityByName(target.name, target.country);
    await new ShellPage(page).expectAuthenticatedHome();
  });
});
