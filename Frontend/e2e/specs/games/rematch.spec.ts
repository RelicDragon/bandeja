import { test, expect } from '@playwright/test';
import { displayName, e2eLoginBoth, type E2eUser } from '../../fixtures/api-client';
import {
  createGameViaApi,
  createGameWithOwnerPlaying,
  deleteGameViaApi,
  finalizeGameResultsViaApi,
  getGameViaApi,
  joinGameViaApi,
} from '../../fixtures/games.fixture';
import { GameDetailsPage } from '../../pages/game-details.page';
import { CreateGamePage } from '../../pages/create-game.page';

/**
 * PRD 362 — "Play with this group again".
 *
 * An unplayed game keeps Duplicate; a FINAL game offers one rematch button
 * instead, which opens create with the format copied, no schedule or court,
 * and the previous roster preselected as invitees. Creating the rematch sends
 * ordinary invites (INVITED, never PLAYING) and books nothing.
 */
test.describe('play with this group again @auth @seed:games', () => {
  test.describe.configure({ mode: 'serial' });
  let tokenA: string;
  let tokenB: string;
  let userA: E2eUser;
  let userB: E2eUser;
  const cleanupIds: string[] = [];

  test.beforeAll(async () => {
    const both = await e2eLoginBoth();
    tokenA = both.tokenA;
    tokenB = both.tokenB;
    userA = both.userA;
    userB = both.userB;
  });

  test.afterAll(async () => {
    await Promise.all(cleanupIds.map((id) => deleteGameViaApi(tokenA, id)));
  });

  test('C-06 Duplicate still present on an unplayed game, no rematch', async ({ page }) => {
    const { id } = await createGameWithOwnerPlaying(tokenA, userA.id, `[E2E] duplicate ${Date.now()}`);

    try {
      const details = new GameDetailsPage(page);
      await details.goto(id);
      await details.expectDuplicateVisible();
      await details.expectRematchHidden();
      await details.clickDuplicate();

      const create = new CreateGamePage(page);
      await create.expectWizardLoaded('GAME');
      await create.expectRematchBannerHidden();
    } finally {
      // Fixtures share one future slot; free it so the next test's game does not
      // trip the overlap confirmation on create.
      await deleteGameViaApi(tokenA, id);
    }
  });

  test('GD-RM-01 FINAL game: rematch replaces Duplicate and opens a fresh draft with invitees', async ({ page }) => {
    const { id } = await createGameViaApi(tokenA, userA.id, {
      maxParticipants: 2,
      playersPerMatch: 2,
      participants: [userA.id],
      allowDirectJoin: true,
      isPublic: true,
      name: `[E2E] rematch source ${Date.now()}`,
    });
    cleanupIds.push(id);
    await joinGameViaApi(tokenB, id);
    await finalizeGameResultsViaApi(tokenA, id, userA.id, userB.id);

    const details = new GameDetailsPage(page);
    await details.goto(id);
    await details.expectRematchVisible();
    await details.expectDuplicateHidden();
    await details.clickRematch();

    const create = new CreateGamePage(page);
    await create.expectWizardLoaded('GAME');
    await create.expectRematchBannerVisible();
    await create.expectInviteeChipVisible(displayName(userB));

    // A rematch never inherits the old slot: submitting before picking a time is blocked.
    await create.submitExpectBlocked('GAME');

    await create.selectFirstAvailableTimeSlot();
    const newId = await create.submitCreate('GAME');
    expect(newId).toBeTruthy();
    cleanupIds.push(newId);

    const created = await getGameViaApi(tokenA, newId);
    expect(created.resultsStatus).toBe('NONE');
    expect(created.hasBookedCourt).toBeFalsy();
    const invitee = created.participants?.find((p) => p.userId === userB.id);
    expect(invitee?.status).toBe('INVITED');
    expect(created.participants?.some((p) => p.userId === userB.id && p.status === 'PLAYING')).toBe(false);
  });
});
