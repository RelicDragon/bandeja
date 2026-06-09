import { test, expect, devices } from '@playwright/test';
import { HomePage } from '../../pages/home.page';

test.use({ ...devices['Pixel 7'] });

test.describe('home banners & misc @auth', () => {
  test('H-05 sport questionnaire prompt', async () => {
    test.skip(true, 'requires user with incomplete sport questionnaire');
  });

  test('H-06 city prompt banner', async () => {
    test.skip(true, 'requires user missing city prefs');
  });

  test('H-07 gender prompt banner', async () => {
    test.skip(true, 'requires applicable gender prompt state');
  });

  test('H-08 user teams section', async () => {
    test.skip(true, 'requires user in teams');
  });

  test('H-09 your leagues section', async () => {
    test.skip(true, 'requires user in leagues');
  });

  test('H-10 past games section', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto('tab=past-games');
    await home.waitForMyGamesLoaded();
    await expect(home.subtab('past-games')).toHaveAttribute('aria-selected', 'true');
  });

  test('H-11 mark all read banner', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.waitForMyGamesLoaded();
    const banner = home.markAllReadButton();
    if ((await banner.count()) === 0) {
      test.skip(true, 'no unread games for mark-all banner');
    }
    await banner.click();
    await expect(banner).toHaveCount(0, { timeout: 15_000 });
  });

  test('H-18 unread badge on game card', async () => {
    test.skip(true, 'requires game with chat unread count');
  });

  test('H-29 past games unread badge', async () => {
    test.skip(true, 'requires unread on past game');
  });

  test('H-35 invite friend to app', async () => {
    test.skip(true, 'InviteFriendToBandejaButton lives in player list modal — needs stable entry');
  });
});
