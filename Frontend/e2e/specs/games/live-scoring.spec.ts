import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { createLiveScoringFixture, deleteGameViaApi } from '../../fixtures/games.fixture';
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
});
