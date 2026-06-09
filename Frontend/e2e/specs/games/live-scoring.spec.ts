import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import {
  createLiveScoringFixture,
  deleteGameViaApi,
  getLiveSpectatorTokenViaApi,
} from '../../fixtures/games.fixture';
import { LiveScoringPage } from '../../pages/live-scoring.page';

test.describe('live scoring @auth @seed:games', () => {
  test.describe.configure({ mode: 'serial' });
  let token: string;
  let userId: string;
  let gameId: string;
  let matchId: string;

  test.beforeAll(async () => {
    const session = await e2eLogin();
    token = session.token;
    userId = session.user.id;
    const fixture = await createLiveScoringFixture(token, userId);
    gameId = fixture.gameId;
    matchId = fixture.matchId;
  });

  test.afterAll(async () => {
    if (gameId) {
      await deleteGameViaApi(token, gameId);
    }
  });

  test('LS-01 open live board', async ({ page }) => {
    const live = new LiveScoringPage(page);
    await live.goto(gameId, matchId);
    await live.dismissServeSetupIfPresent();
    await live.expectBoardLoaded();
  });

  test('LS-02 point for team A', async ({ page }) => {
    const live = new LiveScoringPage(page);
    await live.goto(gameId, matchId);
    await live.dismissServeSetupIfPresent();
    await live.expectBoardLoaded();
    const before = await live.readTeamAScore();
    await live.scorePointForTeamA();
    await expect.poll(async () => live.readTeamAScore()).not.toBe(before);
  });

  test('LS-02 point for team B', async ({ page }) => {
    const live = new LiveScoringPage(page);
    await live.goto(gameId, matchId);
    await live.dismissServeSetupIfPresent();
    await live.expectBoardLoaded();
    const before = await live.readTeamBScore();
    await live.scorePointForTeamB();
    await expect.poll(async () => live.readTeamBScore()).not.toBe(before);
  });

  test('LS-03 undo last point', async ({ page }) => {
    const live = new LiveScoringPage(page);
    await live.goto(gameId, matchId);
    await live.dismissServeSetupIfPresent();
    await live.expectBoardLoaded();
    const baseline = await live.readTeamAScore();
    await live.scorePointForTeamA();
    await expect.poll(async () => live.readTeamAScore()).not.toBe(baseline);
    await live.undoTeamA();
    await expect.poll(async () => live.readTeamAScore()).toBe(baseline);
  });

  test('LS-04 change server', async ({ page }) => {
    const live = new LiveScoringPage(page);
    await live.goto(gameId, matchId);
    await live.setupServeForTeamB();
    await live.expectBoardLoaded();
    await page.getByText(/team b|bench b/i).first().waitFor({ state: 'visible', timeout: 10_000 });
  });
});

test.describe('live scoring spectator @seed:games', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('LS-08 spectator token', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const fixture = await createLiveScoringFixture(token, user.id);
    try {
      const spectatorToken = await getLiveSpectatorTokenViaApi(token, fixture.gameId, fixture.matchId);
      const live = new LiveScoringPage(page);
      await live.goto(fixture.gameId, fixture.matchId, `spectatorToken=${encodeURIComponent(spectatorToken)}`);
      await live.dismissServeSetupIfPresent();
      await live.expectBoardLoaded();
    } finally {
      await deleteGameViaApi(token, fixture.gameId);
    }
  });
});
