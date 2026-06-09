import { test, expect } from '@playwright/test';
import { OnboardingPage } from '../../pages/onboarding.page';
import { ShellPage } from '../../pages/shell.page';
import { ShellPage } from '../../pages/shell.page';
import { seedAuthInBrowser } from '../../fixtures/storage.fixture';
import {
  createCityPromptUser,
  createGenderPromptUser,
  createNameGateUser,
  createNoSportsUser,
  createPrimarySportGateUser,
  createWelcomePromptUser,
  registerTestUser,
  updateTestProfile,
} from '../../fixtures/persona.fixture';
import { createJoinableGame, deleteGameViaApi } from '../../fixtures/games.fixture';

test.describe('onboarding gates', () => {
  test('OG-01 G-08 profile name gate blocks join', async ({ page }) => {
    const { token, user } = await createNameGateUser();
    await seedAuthInBrowser(page, token, user);
    const { token: ownerToken, user: owner } = await registerTestUser();
    const { id: gameId } = await createJoinableGame(ownerToken, owner.id);
    try {
      await page.goto('/find');
      await new ShellPage(page).waitForShellReady();
      const joinBtn = page.getByRole('button', { name: /^join$/i }).first();
      if (await joinBtn.isVisible()) {
        await joinBtn.click();
      } else {
        await page.goto(`/games/${gameId}`);
        await page.getByRole('button', { name: /^join$/i }).click();
      }
      await new OnboardingPage(page).expectNameGateOpen();
    } finally {
      await deleteGameViaApi(ownerToken, gameId);
    }
  });

  test('OG-02 name gate resume', async ({ page }) => {
    const { token, user } = await createNameGateUser();
    await seedAuthInBrowser(page, token, user);
    await page.goto('/create-game');
    await new OnboardingPage(page).expectNameGateOpen();
    await new OnboardingPage(page).saveName('Gate', 'Resume');
    await expect(page).toHaveURL(/\/(create-game)?/);
  });

  test('OG-03 G-09 primary sport gate', async ({ page }) => {
    const { token, user } = await createPrimarySportGateUser();
    await seedAuthInBrowser(page, token, user);
    await page.goto('/');
    await new OnboardingPage(page).expectPrimarySportGate();
  });

  test('G-09 redirect without enabled sports', async ({ page }) => {
    const { token, user } = await createNoSportsUser();
    await page.route('**/api/users/profile', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      if (json?.data) {
        json.data.sportsEnabled = [];
      }
      await route.fulfill({ response, json });
    });
    await seedAuthInBrowser(page, token, user);
    await page.goto('/');
    await expect(page).toHaveURL(/\/profile/, { timeout: 20_000 });
  });

  test('OG-04 gender prompt banner', async ({ page }) => {
    const { token, user } = await createGenderPromptUser();
    await seedAuthInBrowser(page, token, user);
    await page.goto('/');
    await expect(new OnboardingPage(page).genderPromptBanner()).toBeVisible({ timeout: 20_000 });
  });

  test('OG-05 gender prompt dismiss', async ({ page }) => {
    const { token, user } = await createGenderPromptUser();
    await seedAuthInBrowser(page, token, user);
    await page.goto('/');
    const onboarding = new OnboardingPage(page);
    await onboarding.genderPromptBanner().waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: /don.?t show again|dismiss/i }).first().click();
    await page.getByRole('button', { name: /^confirm$|^dismiss$/i }).click();
    await expect(onboarding.genderPromptBanner()).toHaveCount(0);
  });

  test('OG-06 city prompt banner', async ({ page }) => {
    const { token, user } = await createCityPromptUser();
    await seedAuthInBrowser(page, token, user);
    await page.goto('/');
    await expect(new OnboardingPage(page).cityPromptBanner()).toBeVisible({ timeout: 20_000 });
  });

  test('OG-07 welcome questionnaire', async ({ page }) => {
    const { token, user } = await createWelcomePromptUser();
    await seedAuthInBrowser(page, token, user);
    await page.goto('/');
    await expect(new OnboardingPage(page).welcomePromptBanner()).toBeVisible({ timeout: 20_000 });
  });

  test('OG-08 welcome questionnaire skip', async ({ page }) => {
    const { token, user } = await createWelcomePromptUser();
    await seedAuthInBrowser(page, token, user);
    await page.goto('/');
    await page.getByRole('button', { name: /skip|dismiss|don.?t show/i }).first().click();
    await page.getByRole('button', { name: /^confirm$|^skip$/i }).click();
    await expect(new OnboardingPage(page).welcomePromptBanner()).toHaveCount(0, { timeout: 20_000 });
  });

  test('OG-09 sport questionnaire prompt', async ({ page }) => {
    const { token, user } = await registerTestUser();
    await updateTestProfile(token, { cityIsSet: true, welcomeScreenPassed: true });
    await seedAuthInBrowser(page, token, { ...user, cityIsSet: true, welcomeScreenPassed: true });
    await page.goto('/');
    await expect(new OnboardingPage(page).sportQuestionnairePrompt()).toBeVisible({ timeout: 25_000 });
  });

  test('OG-10 sport questionnaire complete', async ({ page }) => {
    const { token, user } = await registerTestUser();
    await updateTestProfile(token, { cityIsSet: true, welcomeScreenPassed: true });
    await seedAuthInBrowser(page, token, { ...user, cityIsSet: true, welcomeScreenPassed: true });
    await page.goto('/');
    const prompt = new OnboardingPage(page).sportQuestionnairePrompt();
    await prompt.waitFor({ state: 'visible', timeout: 25_000 });
    await page.getByRole('button', { name: /start|estimate|questionnaire/i }).first().click();
    await page.getByRole('button', { name: /^skip$|not now|later/i }).first().click();
    await page.getByRole('button', { name: /^confirm$|^skip$/i }).click();
    await expect(prompt).toHaveCount(0, { timeout: 20_000 });
  });
});
