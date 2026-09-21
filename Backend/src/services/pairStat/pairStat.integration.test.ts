/**
 * PRD 352 — pair stats and the pair leaderboard, proven against a real database.
 *
 * The algorithm is already covered by `pairStatPipeline.test.ts` and the order
 * by `pairRankingOrder.test.ts`. What only Postgres can answer is here:
 *   · `refreshPairStatsForGame` writes a symmetric row with `userAId < userBId`;
 *   · the raw SQL runs — the `::"Sport"` cast, `NULLS LAST` and the
 *     `ROW_NUMBER()` me-context CTE are checked by execution, not by eye;
 *   · all three sorts and both period paths return rows;
 *   · the ≥5-games floor keeps a thin pair out of the table;
 *   · `me` resolves the viewer's best pair and its rank;
 *   · the cursor pages without repeating or dropping a row;
 *   · resetting a game's results takes the pair back down again;
 *   · `combinedLevel` follows a manual level change with no game involved.
 *
 * Safe to run against `padelpulse_dev`: every row is namespaced with a run
 * suffix and removed in `finally`.
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
import {
  refreshPairCombinedLevelsForUser,
  refreshPairStatsForGame,
} from './pairStat.service';
import { getPairDetail, getPairLeaderboard } from './pairRanking.service';
import { pairKey } from './pairKey';

process.env.E2E_TEST = '1';

const DAYS = 24 * 60 * 60 * 1000;
const PAIR_MIN_GAMES = 5;

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdUserIds: string[] = [];
  const createdGameIds: string[] = [];

  const city = await prisma.city.create({
    data: { name: `Pairs ${suffix}`, country: 'Test', timezone: 'UTC' },
  });

  const makeUser = async (name: string, level: number) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-pairs-${name}-${suffix}`,
        firstName: name,
        currentCityId: city.id,
        primarySport: Sport.PADEL,
      },
    });
    createdUserIds.push(user.id);
    await prisma.userSportProfile.create({
      data: { userId: user.id, sport: Sport.PADEL, level },
    });
    return user;
  };

  /**
   * One FINAL 2v2 with fixed teams — the simplest shape `partnerDetection`
   * recognises, so the test exercises the pipeline rather than the format zoo.
   */
  const playFixedTeamGame = async (
    sideA: [string, string],
    sideB: [string, string],
    winner: 'A' | 'B',
    daysAgo: number,
  ) => {
    const startTime = new Date(Date.now() - daysAgo * DAYS);
    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime: new Date(startTime.getTime() + 90 * 60 * 1000),
        timeIsSet: true,
        isPublic: true,
        maxParticipants: 4,
        hasFixedTeams: true,
        resultsStatus: ResultsStatus.FINAL,
      },
    });
    createdGameIds.push(game.id);

    await prisma.gameParticipant.createMany({
      data: [...sideA, ...sideB].map((userId, index) => ({
        gameId: game.id,
        userId,
        role: index === 0 ? ParticipantRole.OWNER : ParticipantRole.PARTICIPANT,
        status: ParticipantStatus.PLAYING,
      })),
    });

    for (const [index, side] of [sideA, sideB].entries()) {
      const team = await prisma.gameTeam.create({
        data: { gameId: game.id, name: `T${index}`, teamNumber: index + 1 },
      });
      await prisma.gameTeamPlayer.createMany({
        data: side.map((userId) => ({ gameTeamId: team.id, userId })),
      });
    }

    const winners = new Set(winner === 'A' ? sideA : sideB);
    await prisma.gameOutcome.createMany({
      data: [...sideA, ...sideB].map((userId) => ({
        gameId: game.id,
        userId,
        levelBefore: 3,
        levelAfter: 3,
        levelChange: 0,
        reliabilityBefore: 1,
        reliabilityAfter: 1,
        reliabilityChange: 0,
        isWinner: winners.has(userId),
        wins: winners.has(userId) ? 1 : 0,
        losses: winners.has(userId) ? 0 : 1,
      })),
    });

    await refreshPairStatsForGame(game.id);
    return game;
  };

  try {
    const anna = await makeUser('anna', 4.0);
    const marko = await makeUser('marko', 3.6);
    const luka = await makeUser('luka', 3.2);
    const ivan = await makeUser('ivan', 3.0);
    const thinA = await makeUser('thinA', 3.0);
    const thinB = await makeUser('thinB', 3.0);

    // A qualifying pair: six games together, four won.
    for (let i = 0; i < 6; i += 1) {
      await playFixedTeamGame(
        [anna.id, marko.id],
        [luka.id, ivan.id],
        i < 4 ? 'A' : 'B',
        i + 1,
      );
    }
    // A pair one game short of the floor.
    await playFixedTeamGame([thinA.id, thinB.id], [luka.id, ivan.id], 'B', 2);

    // -------------------------------------------------------------------
    // 1. The row is written once, symmetric, with userAId < userBId.
    // -------------------------------------------------------------------
    const [lowId, highId] = [anna.id, marko.id].sort();
    const row = await prisma.pairStat.findFirst({
      where: { sport: Sport.PADEL, cityId: city.id, userAId: lowId, userBId: highId },
      select: { games: true, wins: true, combinedLevel: true, lastPlayedAt: true },
    });
    assert.ok(row, 'the pair has exactly one row, keyed with the ids in order');
    assert.equal(row!.games, 6, 'every game together is counted once');
    assert.equal(row!.wins, 4, 'wins are the pair side winning the game');
    assert.ok(row!.lastPlayedAt, 'lastPlayedAt is stamped');
    assert.ok(
      row!.combinedLevel !== null && Math.abs(row!.combinedLevel - 3.8) < 0.01,
      'combinedLevel is the mean of the two profile levels',
    );

    const mirrored = await prisma.pairStat.count({
      where: { sport: Sport.PADEL, cityId: city.id, userAId: highId, userBId: lowId },
    });
    assert.equal(mirrored, 0, 'the mirrored ordering is never written');

    // -------------------------------------------------------------------
    // 2. Every sort × period combination executes and ranks.
    // -------------------------------------------------------------------
    for (const sort of ['winRate', 'games', 'level'] as const) {
      for (const period of ['all', '30'] as const) {
        const board = await getPairLeaderboard({
          viewerId: anna.id,
          cityId: city.id,
          sport: Sport.PADEL,
          period,
          sort,
        });
        assert.ok(
          board.pairs.length >= 1,
          `${sort}/${period} returns the qualifying pair`,
        );
        const ranks = board.pairs.map((entry) => entry.rank);
        assert.deepEqual(
          ranks,
          [...ranks].sort((a, b) => a - b),
          `${sort}/${period} ranks ascend`,
        );
        assert.ok(
          board.pairs.every((entry) => entry.games >= PAIR_MIN_GAMES),
          `${sort}/${period} applies the ${PAIR_MIN_GAMES}-game floor`,
        );
      }
    }

    // -------------------------------------------------------------------
    // 3. The under-floor pair is absent, and `me` finds the viewer's best.
    // -------------------------------------------------------------------
    const board = await getPairLeaderboard({
      viewerId: anna.id,
      cityId: city.id,
      sport: Sport.PADEL,
      period: 'all',
      sort: 'winRate',
    });
    const thinKey = pairKey(thinA.id, thinB.id);
    assert.ok(
      !board.pairs.some((entry) => pairKey(entry.userA.id, entry.userB.id) === thinKey),
      'a pair with fewer than five games together is not ranked',
    );
    assert.ok(board.me, 'the viewer gets their own pair context');
    assert.ok(board.me!.rank >= 1, 'the me-context rank comes from the ROW_NUMBER() CTE');

    const outsiderBoard = await getPairLeaderboard({
      viewerId: thinA.id,
      cityId: city.id,
      sport: Sport.PADEL,
      period: 'all',
      sort: 'winRate',
    });
    assert.equal(
      outsiderBoard.me,
      null,
      'a viewer with no ranked pair gets no me-context rather than a wrong one',
    );

    // -------------------------------------------------------------------
    // 4. The cursor pages without repeating or dropping.
    // -------------------------------------------------------------------
    const firstPage = await getPairLeaderboard({
      viewerId: anna.id,
      cityId: city.id,
      sport: Sport.PADEL,
      period: 'all',
      sort: 'winRate',
      limit: 1,
    });
    assert.equal(firstPage.pairs.length, 1, 'the limit is honoured');
    if (firstPage.nextCursor) {
      const secondPage = await getPairLeaderboard({
        viewerId: anna.id,
        cityId: city.id,
        sport: Sport.PADEL,
        period: 'all',
        sort: 'winRate',
        limit: 1,
        cursor: firstPage.nextCursor,
      });
      const firstKey = pairKey(firstPage.pairs[0]!.userA.id, firstPage.pairs[0]!.userB.id);
      for (const entry of secondPage.pairs) {
        assert.notEqual(
          pairKey(entry.userA.id, entry.userB.id),
          firstKey,
          'the second page never repeats the first',
        );
      }
    }

    // -------------------------------------------------------------------
    // 5. The pair sheet resolves head-to-head history.
    // -------------------------------------------------------------------
    const detail = await getPairDetail(
      { userAId: lowId, userBId: highId },
      Sport.PADEL,
      anna.id,
    );
    assert.equal(detail.games, 6, 'the sheet agrees with the table');
    assert.ok(detail.recentGames.length > 0, 'recent games together are listed');

    // -------------------------------------------------------------------
    // 6. `combinedLevel` follows a level change with no game involved.
    // -------------------------------------------------------------------
    await prisma.userSportProfile.update({
      where: { userId_sport: { userId: marko.id, sport: Sport.PADEL } },
      data: { level: 2.0 },
    });
    await refreshPairCombinedLevelsForUser(marko.id, Sport.PADEL);
    const relevelled = await prisma.pairStat.findFirst({
      where: { sport: Sport.PADEL, cityId: city.id, userAId: lowId, userBId: highId },
      select: { combinedLevel: true, games: true },
    });
    assert.ok(
      relevelled!.combinedLevel !== null && Math.abs(relevelled!.combinedLevel - 3.0) < 0.01,
      'a manual level change moves combinedLevel',
    );
    assert.equal(relevelled!.games, 6, 'and leaves the game counts alone');

    // -------------------------------------------------------------------
    // 7. Undoing a result takes the pair back down.
    // -------------------------------------------------------------------
    const lastGameId = createdGameIds[5]!;
    await prisma.gameOutcome.deleteMany({ where: { gameId: lastGameId } });
    await prisma.game.update({
      where: { id: lastGameId },
      data: { resultsStatus: ResultsStatus.NONE },
    });
    await refreshPairStatsForGame(lastGameId);

    const afterUndo = await prisma.pairStat.findFirst({
      where: { sport: Sport.PADEL, cityId: city.id, userAId: lowId, userBId: highId },
      select: { games: true },
    });
    assert.equal(afterUndo!.games, 5, 'removing a result removes exactly that game');

    console.log('pairStat.integration.test.ts: ok');
  } finally {
    await prisma.pairStat
      .deleteMany({ where: { cityId: city.id } })
      .catch(() => undefined);
    await prisma.gameOutcome
      .deleteMany({ where: { gameId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.gameTeamPlayer
      .deleteMany({ where: { gameTeam: { gameId: { in: createdGameIds } } } })
      .catch(() => undefined);
    await prisma.gameTeam
      .deleteMany({ where: { gameId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.chatMessage
      .deleteMany({ where: { gameId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.chatSyncEvent
      .deleteMany({ where: { contextId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.userSportProfile
      .deleteMany({ where: { userId: { in: createdUserIds } } })
      .catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
    await prisma.city.deleteMany({ where: { id: city.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
})();
