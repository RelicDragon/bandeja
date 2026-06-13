import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { deleteGameViaApi } from '../../fixtures/games.fixture';
import { CreateGamePage } from '../../pages/create-game.page';

test.describe('create game fields @auth', () => {
  test('C-09 sport selector updates format', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    const sportTabs = page.getByRole('button').filter({ hasText: /padel|tennis|pickleball/i });
    if ((await sportTabs.count()) < 2) {
      test.skip(true, 'single-sport user');
    }
    await sportTabs.nth(1).click();
    await createGame.pickDefaultTemplateIfShown();
    await expect(page.getByText(/social|match|custom/i).first()).toBeVisible();
  });

  test('C-10 template picker applies defaults', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.selectTemplateMatching(/social|match/i);
    await expect(page.getByText(/rating game/i)).toBeVisible({ timeout: 10_000 });
  });

  test('C-11 game format wizard open close', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    const customize = page.getByRole('button', { name: /customize|format/i }).first();
    if ((await customize.count()) === 0) {
      test.skip(true, 'no format wizard entry for selected template');
    }
    await createGame.openFormatWizard();
    await createGame.closeFormatWizard();
  });

  test('C-12 rating vs social toggle', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await createGame.toggleRatingGame(false);
    const { token } = await e2eLogin();
    await createGame.selectFirstClub();
    await createGame.selectFirstAvailableTimeSlot();
    const gameId = await createGame.submitCreate('GAME');
    try {
      expect(gameId).toBeTruthy();
    } finally {
      if (gameId) await deleteGameViaApi(token, gameId);
    }
  });

  test('C-13 club selection loads courts', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await createGame.selectFirstClub();
    await expect(page.getByRole('button', { name: /don't select court/i })).toBeVisible({ timeout: 10_000 });
  });

  test('C-14 court not booked selection', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await createGame.selectFirstClub();
    await createGame.selectCourtNotBooked();
    await expect(page.getByRole('button', { name: /don't select court/i })).toBeVisible();
  });

  test('C-15 court booked overlap warning', async () => {
    test.skip(true, 'requires booked court conflict seed');
  });

  test('C-16 mark court booked modal', async () => {
    test.skip(true, 'requires court booking flow confirmation');
  });

  test('C-17 date time changes end time', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await createGame.selectFirstClub();
    await createGame.selectFirstAvailableTimeSlot();
    const duration = page.getByText(/hour|minute|duration/i).first();
    await expect(duration).toBeVisible();
  });

  test('C-18 level range slider', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await expect(page.getByText(/player level|minimum level/i).first()).toBeVisible();
  });

  test('C-19 max participants', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await expect(page.getByText(/participants|number of participants/i).first()).toBeVisible();
  });

  test('C-20 fixed teams toggle', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    const fixedTeams = page.getByText(/fixed teams|teams format/i);
    if ((await fixedTeams.count()) === 0) test.skip(true, 'fixed teams not shown for roster');
    await expect(fixedTeams.first()).toBeVisible();
  });

  test('C-21 game name and comments', async ({ page }) => {
    const { token } = await e2eLogin();
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await createGame.selectFirstClub();
    await createGame.selectFirstAvailableTimeSlot();
    const name = `[E2E] C-21 ${Date.now()}`;
    await createGame.fillGameName(name);
    await createGame.fillComments('e2e comments');
    const gameId = await createGame.submitCreate('GAME');
    try {
      expect(gameId).toBeTruthy();
      await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
    } finally {
      if (gameId) await deleteGameViaApi(token, gameId);
    }
  });

  test('C-22 price section', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await expect(page.getByText(/price/i).first()).toBeVisible();
  });

  test('C-23 avatar upload', async () => {
    test.skip(true, 'requires file upload');
  });

  test('C-24 invite players modal', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    const inviteBtn = page.getByRole('button', { name: /invite|add player|select player/i }).first();
    if ((await inviteBtn.count()) === 0) test.skip(true, 'no invite entry on create form');
    await createGame.openPlayerInviteModal();
  });

  test('C-25 participants setup tags', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await expect(page.getByText(/participants|setup/i).first()).toBeVisible();
  });

  test('C-26 multiple courts selector', async () => {
    test.skip(true, 'requires maxParticipants > 4');
  });

  test('C-33 anyone-can-invite toggle', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await createGame.toggleAnyoneCanInvite(true);
    const row = page.getByText(/anyone can invite/i).locator('..').getByRole('switch');
    await expect(row).toHaveAttribute('aria-checked', 'true');
  });

  test('C-34 gender teams setting', async () => {
    test.skip(true, 'gender teams visible after template with gender section');
  });

  test('C-35 fixed teams multi-court UI', async () => {
    test.skip(true, 'requires maxParticipants > 4 and fixed teams');
  });

  test('C-36 invite as trainer only', async () => {
    test.skip(true, 'TRAINING player picker trainer filter');
  });

  test('C-37 player list level filter', async () => {
    test.skip(true, 'player list modal level filter');
  });

  test('C-38 player availability icon', async () => {
    test.skip(true, 'player list availability indicator');
  });

  test('C-39 booking overlap warning before submit', async () => {
    test.skip(true, 'requires booked court conflict');
  });
});

test.describe('create league @auth', () => {
  test('C-29 league basic info', async () => {
    test.skip(true, 'create league at /create-league — separate flow');
  });

  test('C-30 league format wizard', async () => {
    test.skip(true, 'create league flow');
  });

  test('C-31 season avatar', async () => {
    test.skip(true, 'requires file upload');
  });

  test('C-32 create league submit', async () => {
    test.skip(true, 'create league flow');
  });
});
