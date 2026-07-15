import { test, expect, type Page } from '@playwright/test';
import { SelectCityPage } from '../../pages/select-city.page';
import { ShellPage } from '../../pages/shell.page';
import { OnboardingPage } from '../../pages/onboarding.page';
import { seedAuthInBrowser } from '../../fixtures/storage.fixture';
import {
  createCityPromptUser,
  createNoCityUser,
  listCities,
  listMapClubs,
} from '../../fixtures/persona.fixture';

test.describe.configure({ mode: 'serial' });

type CitySeed = Awaited<ReturnType<typeof listCities>>[number];

async function openSelectCityAsNoCityUser(page: Page) {
  const { token, user } = await createNoCityUser();
  await seedAuthInBrowser(page, token, user);
  const onboarding = new OnboardingPage(page);
  await page.goto('/');
  if (await onboarding.primarySportModal().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await onboarding.confirmPrimarySport();
  }
  await page.waitForURL(/\/select-city/, { timeout: 20_000 });
  const selectCity = new SelectCityPage(page);
  await selectCity.expectLoaded();
  return { token, selectCity };
}

function pickAnchorCity(cities: CitySeed[]): CitySeed {
  const withCoords = cities.find(
    (c) => c.name === 'Belgrade' && c.latitude != null && c.longitude != null,
  );
  const anyCoords = cities.find((c) => c.latitude != null && c.longitude != null);
  const target = withCoords ?? anyCoords ?? cities[0];
  if (!target) throw new Error('No cities seeded');
  if (target.latitude == null || target.longitude == null) {
    throw new Error(`City ${target.name} missing coordinates for Near me mocks`);
  }
  return target;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    expect(cities.length).toBeGreaterThan(0);

    await seedAuthInBrowser(page, token, user);
    const onboarding = new OnboardingPage(page);
    const selectCity = new SelectCityPage(page);

    await page.goto('/');
    if (await onboarding.primarySportModal().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await onboarding.confirmPrimarySport();
    }
    await page.waitForURL(/\/select-city/, { timeout: 20_000 });
    await selectCity.expectLoaded();
    const target = cities.find((c) => c.name === 'Belgrade') ?? cities[0]!;
    await selectCity.pickCityByName(target.name, target.country);
    await new ShellPage(page).expectAuthenticatedHome();
  });

  test('A-30 A-35 A-36 chrome, search hero, Suggested', async ({ page }) => {
    const { token, selectCity } = await openSelectCityAsNoCityUser(page);
    const cities = await listCities(token);
    expect(cities.length).toBeGreaterThan(0);
    const anchor = pickAnchorCity(cities);

    await selectCity.mockIpLocation(anchor.latitude!, anchor.longitude!);
    await page.reload();
    await selectCity.expectLoaded();
    await selectCity.waitForSearchReady();

    await selectCity.expectNoCitiesClubsModeSwitch();
    await expect(selectCity.searchInput()).toHaveAttribute('placeholder', /search city or club/i);
    await expect(selectCity.nearMeButton()).toBeVisible();
    await expect(selectCity.mapToggleButton()).toBeVisible();

    const searchBox = await selectCity.searchInput().boundingBox();
    const nearMeBox = await selectCity.nearMeButton().boundingBox();
    expect(searchBox && nearMeBox).toBeTruthy();
    expect(searchBox!.y).toBeLessThan(nearMeBox!.y);
    expect(searchBox!.width).toBeGreaterThan(nearMeBox!.width);

    await expect(selectCity.suggestedSection()).toBeVisible({ timeout: 20_000 });
    await expect(selectCity.suggestedSection().getByText(new RegExp(escapeRegExp(anchor.name), 'i'))).toBeVisible();

    await selectCity.searchInput().fill('xx');
    await expect(selectCity.suggestedSection()).toHaveCount(0);
  });

  test('A-33 unified city/club search', async ({ page }) => {
    const { token, selectCity } = await openSelectCityAsNoCityUser(page);
    const clubs = await listMapClubs(token);
    expect(clubs.length).toBeGreaterThan(0);
    const club = clubs.find((c) => c.cityName.trim().length >= 2 && c.cityId);
    expect(club).toBeTruthy();

    await selectCity.waitForSearchReady();
    const mixedQuery = club!.cityName.trim();
    await expect(async () => {
      await selectCity.searchInput().fill(mixedQuery);
      await expect(page.getByText(/^cities$/i)).toBeVisible({ timeout: 2_000 });
      await expect(page.getByText(/^clubs$/i)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 25_000 });
    await selectCity.expectNoCitiesClubsModeSwitch();
  });

  test('A-31 browse countries → cities', async ({ page }) => {
    const { token, selectCity } = await openSelectCityAsNoCityUser(page);
    const cities = await listCities(token);
    expect(cities.length).toBeGreaterThan(0);
    const anchor = pickAnchorCity(cities);
    expect(anchor.country).toBeTruthy();

    await selectCity.waitForSearchReady();
    await selectCity.searchInput().fill(anchor.country!);
    await page.getByRole('button').filter({ hasText: new RegExp(escapeRegExp(anchor.country!), 'i') }).first().click();
    await expect(selectCity.searchInput()).toHaveValue('');
    await page.getByRole('button', { name: new RegExp(escapeRegExp(anchor.name), 'i') }).first().click();
    await expect(selectCity.confirmButton()).toBeEnabled({ timeout: 10_000 });
  });

  test('A-32 Near me → nearest city', async ({ page }) => {
    const { token, selectCity } = await openSelectCityAsNoCityUser(page);
    const cities = await listCities(token);
    const anchor = pickAnchorCity(cities);

    await selectCity.mockIpLocation(anchor.latitude!, anchor.longitude!);
    await page.reload();
    await selectCity.expectLoaded();
    await selectCity.waitForSearchReady();

    await expect(selectCity.confirmButton()).toBeDisabled();
    await selectCity.nearMeButton().click();

    const nearestCity = page.getByRole('button', {
      name: new RegExp(`${escapeRegExp(anchor.name)},\\s*Nearest to you`, 'i'),
    });
    await expect(nearestCity).toBeVisible({ timeout: 20_000 });
    // Near me focuses city; Confirm stays off until user taps the city
    await expect(selectCity.confirmButton()).toBeDisabled();
    await nearestCity.click();
    await expect(page).toHaveURL(/\/select-city/);
    await expect(selectCity.confirmButton()).toBeEnabled({ timeout: 10_000 });
  });

  test('map Use {city} confirm', async ({ page }) => {
    const { token, selectCity } = await openSelectCityAsNoCityUser(page);
    const cities = await listCities(token);
    const anchor = pickAnchorCity(cities);

    await selectCity.mockIpLocation(anchor.latitude!, anchor.longitude!);
    await page.reload();
    await selectCity.expectLoaded();
    await selectCity.waitForSearchReady();

    await selectCity.mapToggleButton().click();
    await expect(selectCity.listToggleButton()).toBeVisible({ timeout: 10_000 });
    await selectCity.expectNoCitiesClubsModeSwitch();
    await selectCity.nearMeButton().click();
    await expect(selectCity.useCityButton(anchor.name)).toBeVisible({ timeout: 20_000 });
    await selectCity.useCityButton(anchor.name).click();
    await expect(selectCity.confirmButton()).toBeEnabled({ timeout: 10_000 });
  });

  test('A-37 Near me calm failure', async ({ page }) => {
    const { selectCity } = await openSelectCityAsNoCityUser(page);
    await selectCity.mockIpLocationUnavailable();
    await page.reload();
    await selectCity.expectLoaded();
    await selectCity.waitForSearchReady();

    await selectCity.nearMeButton().click();
    await expect(page.getByRole('status')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('status')).toContainText(/location|search|map/i);
    await expect(selectCity.searchInput()).toBeEnabled();
    await expect(selectCity.mapToggleButton()).toBeEnabled();
  });

  test('A-34 pick city via club search', async ({ page }) => {
    const { token, selectCity } = await openSelectCityAsNoCityUser(page);
    const clubs = await listMapClubs(token);
    expect(clubs.length).toBeGreaterThan(0);
    const club = clubs.find((c) => c.name.trim().length >= 2 && c.cityId);
    expect(club).toBeTruthy();

    await selectCity.pickCityViaClubSearch(club!.name);
    await new ShellPage(page).expectAuthenticatedHome();
  });
});
