import { test, expect } from '@playwright/test';
import { displayName, inviteUserToGameViaApi } from '../../fixtures/api-client';
import {
  createPrivateGame,
  createQueueOnlyGame,
  deleteGameViaApi,
  joinQueueViaApi,
} from '../../fixtures/games.fixture';
import { registerTeardown, openDualSession } from '../../fixtures/two-user.fixture';
import { GameDetailsPage } from '../../pages/game-details.page';

test.describe('two-user game details participation @two-user @auth', () => {
  test.describe.configure({ mode: 'serial' });

  test('GD-02 private game non-participant', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createPrivateGame(sessions.tokenA, ids.userAId);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      const details = new GameDetailsPage(pageB);
      await details.goto(gameId);
      await details.expectPrivateBadge();
      await details.expectNoJoinCta();
    } finally {
      await cleanup();
    }
  });

  test('GD-10 decline pending invite', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createQueueOnlyGame(sessions.tokenA, ids.userAId, `[E2E] GD-10 ${Date.now()}`);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      await inviteUserToGameViaApi(sessions.tokenA, gameId, ids.userBId);

      const details = new GameDetailsPage(pageB);
      await details.goto(gameId);
      await details.declinePendingInvite();
      await details.expectNotPlaying();
    } finally {
      await cleanup();
    }
  });

  test('GD-11 join queue', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createQueueOnlyGame(sessions.tokenA, ids.userAId, `[E2E] GD-11 ${Date.now()}`);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      const details = new GameDetailsPage(pageB);
      await details.goto(gameId);
      await details.clickJoinQueue();
      await details.expectInJoinQueue();
    } finally {
      await cleanup();
    }
  });

  test('GD-12 owner accept queue', async ({ browser }) => {
    const { pageA, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createQueueOnlyGame(sessions.tokenA, ids.userAId, `[E2E] GD-12 ${Date.now()}`);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      await joinQueueViaApi(sessions.tokenB, gameId);

      const details = new GameDetailsPage(pageA);
      await details.goto(gameId);
      const bName = displayName(sessions.userB);
      await details.expectJoinQueueUserVisible(bName);
      await details.acceptFirstJoinQueueUser();
      await details.expectParticipantNameVisible(bName);
    } finally {
      await cleanup();
    }
  });

  test('GD-13 owner decline queue', async ({ browser }) => {
    const { pageA, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createQueueOnlyGame(sessions.tokenA, ids.userAId, `[E2E] GD-13 ${Date.now()}`);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      await joinQueueViaApi(sessions.tokenB, gameId);

      const details = new GameDetailsPage(pageA);
      await details.goto(gameId);
      const bName = displayName(sessions.userB);
      await details.expectJoinQueueUserVisible(bName);
      await details.declineFirstJoinQueueUser();
      await details.expectJoinQueueUserHidden(bName);
    } finally {
      await cleanup();
    }
  });

  test('GD-14 cancel own queue request', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createQueueOnlyGame(sessions.tokenA, ids.userAId, `[E2E] GD-14 ${Date.now()}`);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      await joinQueueViaApi(sessions.tokenB, gameId);

      const details = new GameDetailsPage(pageB);
      await details.goto(gameId);
      await details.expectInJoinQueue();
      await details.clickCancelJoinQueue();
      await details.expectNotInJoinQueue();
    } finally {
      await cleanup();
    }
  });

  test('GD-15 invite players', async ({ browser }) => {
    const { pageA, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createQueueOnlyGame(sessions.tokenA, ids.userAId, `[E2E] GD-15 ${Date.now()}`);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      const bName = displayName(sessions.userB);
      const details = new GameDetailsPage(pageA);
      await details.goto(gameId);
      await details.clickInvitePlayer();
      await details.invitePlayerByName(bName);
      await details.expandPendingInvites();
      await details.expectPendingInvitesCount(1);
    } finally {
      await cleanup();
    }
  });

  test('GD-16 cancel invite', async ({ browser }) => {
    const { pageA, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createQueueOnlyGame(sessions.tokenA, ids.userAId, `[E2E] GD-16 ${Date.now()}`);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      await inviteUserToGameViaApi(sessions.tokenA, gameId, ids.userBId);

      const details = new GameDetailsPage(pageA);
      await details.goto(gameId);
      await details.expandPendingInvites();
      await details.cancelFirstPendingInvite();
      await expect(pageA.getByText(/pending invites.*\(0\)/i)).toBeHidden({ timeout: 15_000 });
    } finally {
      await cleanup();
    }
  });

  test('GD-17 guest join chat only', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createQueueOnlyGame(sessions.tokenA, ids.userAId, `[E2E] GD-17 ${Date.now()}`);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      await pageB.goto(`/games/${gameId}/chat`);
      await pageB.getByRole('button', { name: /join chat to send/i }).click();
      await pageB.getByText(/guest/i).first().waitFor({ state: 'visible', timeout: 15_000 });
      await expect(pageB).toHaveURL(new RegExp(`/games/${gameId}/chat`));
    } finally {
      await cleanup();
    }
  });
});
