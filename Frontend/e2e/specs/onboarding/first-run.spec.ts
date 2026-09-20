import { test, expect } from '@playwright/test';
import { OnboardingPage } from '../../pages/onboarding.page';
import { RegisterPage } from '../../pages/register.page';
import { ShellPage } from '../../pages/shell.page';
import { seedAuthInBrowser } from '../../fixtures/storage.fixture';
import { generateE2ePhone, registerTestUser } from '../../fixtures/persona.fixture';

/**
 * PRD 350 — guided first-run onboarding.
 *
 * FR-01 is the happy path the PRD asks for: register → onboarding → Home.
 * The rest cover the gate states that only a real router can prove.
 */
test.describe('onboarding first run', () => {
  test('FR-01 register, walk the flow, land on Home', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.goto();
    await register.fillRequiredFields({ phone: generateE2ePhone(), password: 'E2eTest1!' });
    await register.submit();

    // A brand-new account has no `onboardingCompletedAt`, so the gate takes over.
    await page.waitForURL(/\/welcome/, { timeout: 45_000 });

    const onboarding = new OnboardingPage(page);
    await onboarding.expectFirstRunStep('welcome');
    await expect(onboarding.firstRunProgress()).toBeVisible();
    await onboarding.firstRunContinue();

    // 2 — Sport. Continue stays disabled until something is picked.
    await onboarding.expectFirstRunStep('sport');
    await expect(onboarding.firstRunPrimary()).toBeDisabled();
    await onboarding.sportTile('PADEL').click();
    await expect(onboarding.sportPrimaryTag('PADEL')).toBeVisible();
    await expect(onboarding.firstRunPrimary()).toBeEnabled();
    await onboarding.firstRunContinue();

    // Registration supplies a name, so the conditional name step may or may not
    // appear depending on whether an avatar was set. Skip it when it does.
    if (await onboarding.firstRunStep('profile').isVisible().catch(() => false)) {
      await onboarding.firstRunContinue();
    }

    // 3 — Level, 4 — City, 5 — Follow are all skippable.
    await onboarding.expectFirstRunStep('level');
    await onboarding.firstRunSkipStep();

    await onboarding.expectFirstRunStep('city');
    await onboarding.firstRunSkipStep();

    await onboarding.expectFirstRunStep('follow');
    await onboarding.firstRunSkipStep();

    // 6 — Notifications. Web has no push opt-in, so the closing choice shows
    // straight away.
    await onboarding.expectFirstRunStep('notifications');
    await page.locator('[data-testid="onboarding-finish-browse"]').click();

    await expect(page.locator('[data-testid="onboarding-finish"]')).toBeVisible();
    await page.waitForURL(/\/find/, { timeout: 30_000 });
    await new ShellPage(page).waitForShellReady();
  });

  test('FR-02 a completed user never sees the flow', async ({ page }) => {
    // `registerTestUser` completes onboarding through the API by default.
    const { token, user } = await registerTestUser();
    await seedAuthInBrowser(page, token, user);
    await page.goto('/');
    await new ShellPage(page).waitForShellReady();
    await expect(page).not.toHaveURL(/\/welcome/);
  });

  test('FR-03 an unfinished user is pulled back into the flow', async ({ page }) => {
    const { token, user } = await registerTestUser({ skipOnboardingComplete: true });
    await seedAuthInBrowser(page, token, user);
    await page.goto('/');
    await page.waitForURL(/\/welcome/, { timeout: 30_000 });
    await new OnboardingPage(page).expectFirstRunStep('welcome');
  });

  test('FR-04 resume lands on the saved step', async ({ page }) => {
    const { token, user } = await registerTestUser({ skipOnboardingComplete: true });
    await seedAuthInBrowser(page, token, user);
    await page.goto('/welcome');

    const onboarding = new OnboardingPage(page);
    await onboarding.expectFirstRunStep('welcome');
    await onboarding.firstRunContinue();
    await onboarding.expectFirstRunStep('sport');

    // Quit and come back — the saved step is where the flow restarts.
    await page.goto('/welcome');
    await onboarding.expectFirstRunStep('sport');
  });

  test('FR-05 a deep link survives the flow', async ({ page }) => {
    const { token, user } = await registerTestUser({ skipOnboardingComplete: true });
    await seedAuthInBrowser(page, token, user);

    // Heading for a real destination while unfinished: the gate intercepts it…
    await page.goto('/leaderboard');
    await page.waitForURL(/\/welcome/, { timeout: 30_000 });

    // …and the flow must hand it back, not swallow it.
    const stored = await page.evaluate(() =>
      sessionStorage.getItem('bandeja_post_onboarding_path'),
    );
    expect(stored).toBe('/leaderboard');
  });
});
