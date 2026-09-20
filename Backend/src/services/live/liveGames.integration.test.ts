/**
 * PRD 349 — DB-touching checks that pure tests cannot cover:
 *
 *  1. the spectator-token gate refuses private, non-live and opted-out games;
 *  2. `listLiveGames` never returns a game the gate would refuse;
 *  3. the follower live push is deduped by `LiveGameNotifyDelivery`, so a
 *     second `IN_PROGRESS` transition sends nothing;
 *  4. the results payload is a whitelist — no `paymentHint`, no player `bio`
 *     or `weeklyAvailability` — and a private game is unreadable without a
 *     roster row;
 *  5. a spectator token stops working the moment the game leaves the live gate.
 *
 * Safe to run against `padelpulse_dev`: every row it creates is suffixed and
 * deleted in the `finally` block.
 *
 * Run: `ts-node --transpile-only src/services/live/liveGames.integration.test.ts`
 */
import assert from 'node:assert/strict';
import {
  EntityType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  ResultsStatus,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import notificationService from '../notification.service';
import { findLiveRailGame, listLiveGames } from '../game/liveGames.service';
import { notifyFollowersGameWentLive } from './liveGameNotify.service';
import { getGameResults } from '../results.service';
import { collectGameResultsContractIssues } from '../results/gameResults.projection';
import { assertCanReadGameResults } from '../results/gameResultsAccess';
import { assertSpectatorGameStillWatchable } from '../results/liveSpectator.service';
import { ApiError } from '../../utils/ApiError';

const LIVE_STATE = {
  mode: 'classic',
  activeSetIndex: 0,
  sets: [{ teamA: 4, teamB: 3, isTieBreak: false }],
  classic: {
    pointState: { kind: 'regular', teamA: 30, teamB: 15 },
    withinSetTieBreak: false,
    tieBreakA: 0,
    tieBreakB: 0,
    classicPointsPlayedInGame: 3,
    deuceCount: 0,
  },
};

function liveMetadata(revision: number) {
  return {
    liveScoring: {
      v: 1,
      revision,
      updatedAt: new Date().toISOString(),
      state: LIVE_STATE,
    },
  };
}

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdGameIds: string[] = [];
  const createdUserIds: string[] = [];
  let cityId = '';

  const originalSend = notificationService.sendNotification.bind(notificationService);
  const sentTo: string[] = [];
  notificationService.sendNotification = async (request) => {
    sentTo.push(request.userId);
    return { telegram: false, push: false };
  };

  try {
    const city = await prisma.city.create({
      data: { name: `Live rail ${suffix}`, country: 'Test', timezone: 'UTC' },
    });
    cityId = city.id;

    const makeUser = async (label: string) => {
      const user = await prisma.user.create({
        data: {
          phone: `qa-live-${label}-${suffix}`,
          firstName: label,
          currentCityId: city.id,
          sportsEnabled: [Sport.PADEL],
          sportProfiles: { create: { sport: Sport.PADEL, level: 3 } },
        },
      });
      createdUserIds.push(user.id);
      return user;
    };

    const [playerA, playerB, follower, stranger] = await Promise.all([
      makeUser('PlayerA'),
      makeUser('PlayerB'),
      makeUser('Follower'),
      makeUser('Stranger'),
    ]);

    const makeGame = async (
      label: string,
      overrides: { isPublic?: boolean; showOnLiveRail?: boolean; resultsStatus?: ResultsStatus },
      withLiveMatch = true,
    ) => {
      const game = await prisma.game.create({
        data: {
          name: `Live ${label} ${suffix}`,
          entityType: EntityType.GAME,
          gameType: GameType.CLASSIC,
          sport: Sport.PADEL,
          cityId: city.id,
          startTime: new Date(Date.now() - 30 * 60 * 1000),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
          maxParticipants: 4,
          isPublic: overrides.isPublic ?? true,
          showOnLiveRail: overrides.showOnLiveRail ?? true,
          resultsStatus: overrides.resultsStatus ?? ResultsStatus.IN_PROGRESS,
          participants: {
            create: [
              {
                userId: playerA.id,
                role: ParticipantRole.OWNER,
                status: ParticipantStatus.PLAYING,
              },
              {
                userId: playerB.id,
                role: ParticipantRole.PARTICIPANT,
                status: ParticipantStatus.PLAYING,
              },
            ],
          },
        },
      });
      createdGameIds.push(game.id);

      if (withLiveMatch) {
        const round = await prisma.round.create({
          data: { gameId: game.id, roundNumber: 1 },
        });
        const match = await prisma.match.create({
          data: { roundId: round.id, matchNumber: 1, metadata: liveMetadata(3) },
        });
        const teamOne = await prisma.team.create({
          data: { matchId: match.id, teamNumber: 1 },
        });
        const teamTwo = await prisma.team.create({
          data: { matchId: match.id, teamNumber: 2 },
        });
        await prisma.teamPlayer.createMany({
          data: [
            { teamId: teamOne.id, userId: playerA.id },
            { teamId: teamTwo.id, userId: playerB.id },
          ],
        });
      }
      return game;
    };

    const watchable = await makeGame('watchable', {});
    const privateGame = await makeGame('private', { isPublic: false });
    const optedOut = await makeGame('optedOut', { showOnLiveRail: false });
    const notLive = await makeGame('notLive', { resultsStatus: ResultsStatus.NONE });

    /* ---- 1. the spectator-token gate ---- */
    const railGame = await findLiveRailGame(watchable.id);
    assert.ok(railGame, 'a public, live, rail-visible game must be watchable');
    assert.ok(railGame.liveSummary.matchId, 'the gate must hand back a match to sign a token for');
    assert.equal(railGame.liveSummary.revision, 3, 'the envelope revision must survive');

    assert.equal(await findLiveRailGame(privateGame.id), null, 'private game must be refused');
    assert.equal(await findLiveRailGame(optedOut.id), null, 'opted-out game must be refused');
    assert.equal(await findLiveRailGame(notLive.id), null, 'non-live game must be refused');

    /* ---- 2. the rail list applies the same gate ---- */
    const listed = await listLiveGames({ cityId: city.id, viewerUserId: stranger.id });
    const listedIds = listed.map((g) => g.id);
    assert.deepEqual(listedIds, [watchable.id], 'only the watchable game reaches the rail');
    assert.equal(listed[0].viewerIsPlaying, false);

    const asPlayer = await listLiveGames({ cityId: city.id, viewerUserId: playerA.id });
    assert.equal(asPlayer[0].viewerIsPlaying, true, 'the viewer\'s own game carries the "You" tag');

    /* ---- 3. follower push dedupe ---- */
    await prisma.userFavoriteUser.create({
      data: { userId: follower.id, favoriteUserId: playerA.id },
    });

    sentTo.length = 0;
    const first = await notifyFollowersGameWentLive(watchable.id);
    assert.equal(first.sent, 1, 'the follower is told once');
    assert.deepEqual(sentTo, [follower.id]);

    sentTo.length = 0;
    const second = await notifyFollowersGameWentLive(watchable.id);
    assert.equal(second.sent, 0, 'a second IN_PROGRESS transition must send nothing');
    assert.deepEqual(sentTo, [], 'dedupe happens before dispatch, not after');

    const deliveries = await prisma.liveGameNotifyDelivery.count({
      where: { gameId: watchable.id },
    });
    assert.equal(deliveries, 1, 'exactly one delivery row per (userId, gameId)');

    /* ---- 4. a hidden game never notifies ---- */
    sentTo.length = 0;
    const hidden = await notifyFollowersGameWentLive(optedOut.id);
    assert.equal(hidden.sent, 0);
    assert.equal(hidden.skipped, 'rail-hidden');

    const priv = await notifyFollowersGameWentLive(privateGame.id);
    assert.equal(priv.skipped, 'not-public');

    /* ---- 5. the results payload is a whitelist, not a dump ---- */

    /*
     * `GET /api/results/game/:gameId` is `optionalAuth` and used to run a
     * top-level Prisma `include`, so one unauthenticated request returned PRD
     * 348's `Game.paymentHint` (an IBAN / Revolut handle) plus every player's
     * `bio` and `weeklyAvailability` — for private games too.
     */
    await prisma.game.update({
      where: { id: watchable.id },
      data: {
        paymentHint: `Revolut @qa-${suffix}`,
        description: 'internal notes',
        priceTotal: 4000,
      },
    });
    await prisma.user.update({
      where: { id: playerA.id },
      data: {
        bio: 'my private bio',
        weeklyAvailability: { mon: ['18:00'] },
      },
    });

    const publicResults = (await getGameResults(watchable.id)) as Record<string, unknown>;
    assert.deepEqual(
      collectGameResultsContractIssues(publicResults),
      [],
      'no forbidden Game scalar or user field may reach a results response',
    );
    assert.equal('paymentHint' in publicResults, false, 'paymentHint never ships with results');
    assert.equal('description' in publicResults, false);
    assert.equal('priceTotal' in publicResults, false);
    const serialized = JSON.stringify(publicResults);
    assert.equal(
      serialized.includes('my private bio'),
      false,
      'a player bio must not appear anywhere in the payload',
    );
    assert.equal(serialized.includes(`Revolut @qa-${suffix}`), false);
    assert.ok(Array.isArray(publicResults.rounds), 'the scoreboard itself still ships');

    /* ---- 6. authorization: public yes, private only for the roster ---- */

    // A guest may read a public game's scoreboard — that is the whole point of
    // `optionalAuth` here, and the live/deep-link surfaces depend on it.
    await assertCanReadGameResults(watchable.id, null);

    await assert.rejects(
      () => assertCanReadGameResults(privateGame.id, null),
      (error: unknown) => error instanceof ApiError && error.statusCode === 404,
      'an unauthenticated request must not read a private game at all',
    );
    await assert.rejects(
      () => assertCanReadGameResults(privateGame.id, stranger.id),
      (error: unknown) => error instanceof ApiError && error.statusCode === 404,
      'a signed-in stranger is refused with 404, not 403 — no existence oracle',
    );
    // A roster member of the private game still gets in.
    await assertCanReadGameResults(privateGame.id, playerA.id);

    /* ---- 7. the spectator token dies with the live gate ---- */

    /*
     * The 48 h token is minted only for a public, live, rail-visible game, but
     * redemption used to check nothing but the signature — so a token minted
     * while the game was public kept working after the organizer made the game
     * private or switched "Show on Live now" off.
     */
    await assertSpectatorGameStillWatchable(watchable.id);
    for (const [label, patch] of [
      ['made private', { isPublic: false }],
      ['opted out of the rail', { showOnLiveRail: false }],
      ['finished', { resultsStatus: ResultsStatus.FINAL }],
    ] as const) {
      await prisma.game.update({ where: { id: watchable.id }, data: patch });
      await assert.rejects(
        () => assertSpectatorGameStillWatchable(watchable.id),
        (error: unknown) => error instanceof ApiError && error.statusCode === 404,
        `a token must stop working once the game is ${label}`,
      );
      await prisma.game.update({
        where: { id: watchable.id },
        data: { isPublic: true, showOnLiveRail: true, resultsStatus: ResultsStatus.IN_PROGRESS },
      });
    }
    await assertSpectatorGameStillWatchable(watchable.id);

    console.log('liveGames.integration.test.ts: ok');
  } finally {
    notificationService.sendNotification = originalSend;
    await prisma.liveGameNotifyDelivery.deleteMany({
      where: { gameId: { in: createdGameIds } },
    });
    await prisma.userFavoriteUser.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    for (const gameId of createdGameIds) {
      await prisma.game.delete({ where: { id: gameId } }).catch(() => undefined);
    }
    for (const userId of createdUserIds) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    if (cityId) {
      await prisma.city.delete({ where: { id: cityId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
})();
