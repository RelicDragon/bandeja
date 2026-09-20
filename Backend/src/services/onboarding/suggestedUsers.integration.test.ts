/**
 * PRD 350 — "People to follow" against a real database.
 *
 * Covers the Testing Decisions a pure test cannot answer: the city filter, the
 * sport filter, blocked-user exclusion **in both directions**, exclusion of the
 * viewer and of people already followed, and the ranking itself (finished games
 * in the last 60 days, most first) together with the "{{count}} games this
 * month" number, which counts a different, shorter window.
 *
 * Safe to run against `padelpulse_dev`: every row is namespaced with a run
 * suffix and removed in `finally`.
 */
import assert from 'node:assert/strict';
import {
  EntityType,
  GameStatus,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { getSuggestedUsers } from './suggestedUsers.service';

const DAY = 24 * 60 * 60 * 1000;

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdUserIds: string[] = [];
  const createdGameIds: string[] = [];
  const createdCityIds: string[] = [];

  const makeCity = async (label: string) => {
    const city = await prisma.city.create({
      data: { name: `Onboarding ${label} ${suffix}`, country: 'Test', timezone: 'UTC' },
    });
    createdCityIds.push(city.id);
    return city;
  };

  const makeUser = async (
    name: string,
    cityId: string,
    sports: Sport[] = [Sport.PADEL],
  ) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-onboarding-${name}-${suffix}`,
        firstName: name,
        currentCityId: cityId,
        primarySport: sports[0] ?? Sport.PADEL,
        sportsEnabled: sports,
      },
    });
    createdUserIds.push(user.id);
    return user;
  };

  /**
   * One finished game `daysAgo` in the past with everyone seated as PLAYING.
   * `endedDaysAgo` stretches it (a league season, a multi-day tournament) so the
   * window boundary can be exercised on its real bound, `endTime`.
   */
  const makeFinishedGame = async (
    cityId: string,
    sport: Sport,
    daysAgo: number,
    userIds: string[],
    options: { endedDaysAgo?: number } = {},
  ) => {
    const startTime = new Date(Date.now() - daysAgo * DAY);
    const endTime =
      options.endedDaysAgo === undefined
        ? new Date(startTime.getTime() + 90 * 60 * 1000)
        : new Date(Date.now() - options.endedDaysAgo * DAY);
    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport,
        gameType: GameType.CLASSIC,
        cityId,
        startTime,
        endTime,
        timeIsSet: true,
        isPublic: true,
        maxParticipants: 8,
        status: GameStatus.FINISHED,
        participants: {
          create: userIds.map((userId, index) => ({
            userId,
            role: index === 0 ? ParticipantRole.OWNER : ParticipantRole.PARTICIPANT,
            status: ParticipantStatus.PLAYING,
          })),
        },
      },
    });
    createdGameIds.push(game.id);
    return game;
  };

  try {
    const city = await makeCity('home');
    const otherCity = await makeCity('away');

    const viewer = await makeUser('viewer', city.id);
    const top = await makeUser('top', city.id);
    const mid = await makeUser('mid', city.id);
    const stale = await makeUser('stale', city.id);
    const blockedByViewer = await makeUser('blockedby', city.id);
    const blockerOfViewer = await makeUser('blockerof', city.id);
    const alreadyFollowed = await makeUser('followed', city.id);
    const otherCityPlayer = await makeUser('awayplayer', otherCity.id);
    const otherSportPlayer = await makeUser('tennis', city.id, [Sport.TENNIS]);

    // Ranking window: `top` = 3 games, `mid` = 2, `stale` = 0 (too old).
    await makeFinishedGame(city.id, Sport.PADEL, 5, [top.id, mid.id]);
    await makeFinishedGame(city.id, Sport.PADEL, 20, [top.id]);
    await makeFinishedGame(city.id, Sport.PADEL, 50, [top.id]);
    await makeFinishedGame(city.id, Sport.PADEL, 200, [stale.id]);
    // Started before the 60-day window, finished inside it: it counts, because
    // the window is on `endTime`. On a `startTime` bound this one disappears.
    await makeFinishedGame(city.id, Sport.PADEL, 61, [mid.id], { endedDaysAgo: 59 });

    // Loud but excluded.
    await makeFinishedGame(city.id, Sport.PADEL, 2, [
      blockedByViewer.id,
      blockerOfViewer.id,
      alreadyFollowed.id,
      viewer.id,
    ]);
    // Same sport, different city.
    await makeFinishedGame(otherCity.id, Sport.PADEL, 2, [otherCityPlayer.id]);
    // Same city, different sport.
    await makeFinishedGame(city.id, Sport.TENNIS, 2, [otherSportPlayer.id]);

    await prisma.blockedUser.createMany({
      data: [
        { userId: viewer.id, blockedUserId: blockedByViewer.id },
        { userId: blockerOfViewer.id, blockedUserId: viewer.id },
      ],
    });
    await prisma.userFavoriteUser.create({
      data: { userId: viewer.id, favoriteUserId: alreadyFollowed.id },
    });

    const suggestions = await getSuggestedUsers({
      viewerId: viewer.id,
      cityId: city.id,
      sport: Sport.PADEL,
      limit: 8,
    });

    const ids = suggestions.map((row) => (row.user as { id: string }).id);

    // Ranking: most finished games in the window first.
    assert.deepEqual(
      ids.slice(0, 2),
      [top.id, mid.id],
      'ranked by finished games in the last 60 days, most first',
    );
    assert.equal(suggestions[0].gamesInWindow, 3);
    assert.equal(
      suggestions[1].gamesInWindow,
      2,
      'the game that started at 61 days but finished at 59 is inside the window',
    );

    // "{{count}} games this month" uses the 30-day window, not the 60-day one.
    assert.equal(
      suggestions[0].gamesThisMonth,
      2,
      'the 5- and 20-day-old games are inside 30 days; the 50-day-old one is not',
    );
    assert.equal(
      suggestions[1].gamesThisMonth,
      1,
      'the straddling game finished 59 days ago, well outside the 30-day window',
    );

    // Exclusions.
    assert.equal(ids.includes(viewer.id), false, 'the viewer is never suggested');
    assert.equal(ids.includes(blockedByViewer.id), false, 'users the viewer blocked');
    assert.equal(ids.includes(blockerOfViewer.id), false, 'users who blocked the viewer');
    assert.equal(ids.includes(alreadyFollowed.id), false, 'already-followed users');
    assert.equal(ids.includes(otherCityPlayer.id), false, 'other cities');
    assert.equal(ids.includes(otherSportPlayer.id), false, 'other sports');

    // The fallback keeps the step from being empty, but never ahead of a real
    // player and never with a fabricated count.
    const staleRow = suggestions.find((row) => (row.user as { id: string }).id === stale.id);
    assert.ok(staleRow, 'quiet city players still fill the list');
    assert.equal(staleRow.gamesInWindow, 0);
    assert.ok(ids.indexOf(stale.id) > 1, 'fallback rows sort behind ranked rows');

    // The projection must not leak private profile fields.
    const projected = suggestions[0].user as Record<string, unknown>;
    for (const forbidden of ['phone', 'email', 'wallet', 'appleSub', 'googleId', 'lastUserIP']) {
      assert.equal(forbidden in projected, false, `suggested user leaks ${forbidden}`);
    }
    assert.ok('id' in projected && 'firstName' in projected && 'sportProfiles' in projected);

    // Limit is honoured.
    const two = await getSuggestedUsers({
      viewerId: viewer.id,
      cityId: city.id,
      sport: Sport.PADEL,
      limit: 2,
    });
    assert.equal(two.length, 2);

    console.log('suggestedUsers.integration.test.ts OK');
  } finally {
    await prisma.gameParticipant.deleteMany({ where: { gameId: { in: createdGameIds } } });
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } });
    await prisma.userFavoriteUser.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.blockedUser.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.city.deleteMany({ where: { id: { in: createdCityIds } } });
    await prisma.$disconnect();
  }
})();
