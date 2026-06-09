import { test, expect } from '@playwright/test';
import {
  createLiveScoringFixtureWithUserB,
  deleteGameViaApi,
} from '../../fixtures/games.fixture';
import { registerTeardown, openDualSession } from '../../fixtures/two-user.fixture';
import { LiveScoringPage } from '../../pages/live-scoring.page';

test.describe('two-user live scoring @two-user @auth', () => {
  test.describe.configure({ mode: 'serial' });

  test('LS-10 socket sync @dual-browser', async ({ browser }) => {
    const { pageA, pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const fixture = await createLiveScoringFixtureWithUserB(
        sessions.tokenA,
        ids.userAId,
        ids.userBId,
      );
      gameId = fixture.gameId;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      const liveA = new LiveScoringPage(pageA);
      const liveB = new LiveScoringPage(pageB);
      await liveA.goto(fixture.gameId, fixture.matchId);
      await liveB.goto(fixture.gameId, fixture.matchId);
      await liveA.dismissServeSetupIfPresent();
      await liveB.dismissServeSetupIfPresent();
      await liveA.expectBoardLoaded();
      await liveB.expectBoardLoaded();

      const beforeB = await liveB.readTeamAScore();
      await liveA.scorePointForTeamA();
      await expect.poll(async () => liveB.readTeamAScore(), { timeout: 20_000 }).not.toBe(beforeB);
    } finally {
      await cleanup();
    }
  });
});
