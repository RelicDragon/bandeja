import assert from 'node:assert/strict';
import prisma from '../../config/database';
import { recalculateGameOutcomes } from '../results/outcomes.service';
import {
  getNoviceState,
  markNoviceMilestoneSeen,
  onGameEndedForNovice,
  refreshNoviceProgressForUser,
  unlockAllNoviceFeatures,
} from './noviceProgress.service';
import { countNewcomersDebutedBy } from '../achievements/noviceHostGrant.service';

/**
 * PRD 358 — novice progress end to end against the local dev / CI database.
 *
 * Results FINAL (through `recalculateGameOutcomes`) → counted game, rank 1,
 * debut host + Talent Scout; TRAINING FINISHED → rank; EVENT / no-show never
 * count; Regular → Ambassador; unlock-all + milestone-seen. Outbound
 * notifications are suppressed (`E2E_TEST=1`). Every row created here is
 * deleted in `finally`.
 */

process.env.E2E_TEST = '1';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createdUserIds: string[] = [];
const createdGameIds: string[] = [];
let cityId = '';

async function makeUser(label: string): Promise<string> {
  const user = await prisma.user.create({
    data: { firstName: label, lastName: `Novice-${suffix}` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user.id;
}

async function makeGame(params: {
  entityType: 'GAME' | 'TRAINING' | 'BAR' | 'EVENT';
  status: 'ANNOUNCED' | 'FINISHED' | 'ARCHIVED';
  ownerId: string;
  players: Array<{ userId: string; noShow?: boolean }>;
  startOffsetHours: number;
}): Promise<string> {
  const start = new Date(Date.now() + params.startOffsetHours * 3600_000);
  const game = await prisma.game.create({
    data: {
      cityId,
      entityType: params.entityType,
      gameType: 'CLASSIC',
      status: params.status,
      startTime: start,
      endTime: new Date(start.getTime() + 3600_000),
      maxParticipants: 8,
      minParticipants: 2,
      participants: {
        create: [
          { userId: params.ownerId, role: 'OWNER', status: 'PLAYING' },
          ...params.players
            .filter((p) => p.userId !== params.ownerId)
            .map((p) => ({
              userId: p.userId,
              role: 'PARTICIPANT' as const,
              status: 'PLAYING' as const,
              noShowNotedAt: p.noShow ? new Date() : null,
            })),
        ],
      },
    },
    select: { id: true },
  });
  createdGameIds.push(game.id);
  return game.id;
}

async function stateOf(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      noviceCountedGames: true,
      noviceRank: true,
      noviceDebutGameId: true,
      noviceDebutHostUserId: true,
    },
  });
}

async function achievementIds(userId: string): Promise<string[]> {
  const rows = await prisma.userAchievement.findMany({
    where: { userId, isActive: true },
    select: { definitionId: true },
  });
  return rows.map((r) => r.definitionId).sort();
}

void (async () => {
  const url = new URL(process.env.DB_URL!);
  assert(
    ['localhost', '127.0.0.1'].includes(url.hostname) &&
      ['/padelpulse_dev', '/padelpulse_ci'].includes(url.pathname),
    'Local development or CI database required',
  );
  try {
    const city = await prisma.city.create({
      data: { name: `novice-${suffix}`, country: 'Test', timezone: 'UTC' },
      select: { id: true },
    });
    cityId = city.id;

    const host = await makeUser('Host');
    const newcomer = await makeUser('Newcomer');
    const playerA = await makeUser('PlayerA');
    const playerB = await makeUser('PlayerB');

    const fresh = await stateOf(newcomer);
    assert.deepEqual(
      fresh,
      { noviceCountedGames: 0, noviceRank: 0, noviceDebutGameId: null, noviceDebutHostUserId: null },
      'a new account starts as a Newcomer',
    );

    // -----------------------------------------------------------------------
    // Results FINAL → counted game, rank 1, debut host, Talent Scout
    // -----------------------------------------------------------------------
    const start = new Date(Date.now() - 3 * 3600_000);
    const resultsGame = await prisma.game.create({
      data: {
        cityId,
        entityType: 'GAME',
        gameType: 'CLASSIC',
        status: 'STARTED',
        resultsStatus: 'IN_PROGRESS',
        affectsRating: false,
        startTime: start,
        endTime: new Date(start.getTime() + 3600_000),
        maxParticipants: 4,
        minParticipants: 4,
        participants: {
          create: [
            { userId: host, role: 'OWNER', status: 'PLAYING' },
            { userId: newcomer, role: 'PARTICIPANT', status: 'PLAYING' },
            { userId: playerA, role: 'PARTICIPANT', status: 'PLAYING' },
            { userId: playerB, role: 'PARTICIPANT', status: 'PLAYING' },
          ],
        },
      },
      select: { id: true },
    });
    createdGameIds.push(resultsGame.id);
    await prisma.round.create({
      data: {
        gameId: resultsGame.id,
        roundNumber: 1,
        matches: {
          create: {
            matchNumber: 1,
            teams: {
              create: [
                { teamNumber: 1, players: { create: [{ userId: host }, { userId: newcomer }] } },
                { teamNumber: 2, players: { create: [{ userId: playerA }, { userId: playerB }] } },
              ],
            },
            sets: { create: { setNumber: 1, teamAScore: 6, teamBScore: 3 } },
          },
        },
      },
    });

    await recalculateGameOutcomes(resultsGame.id);

    const afterResults = await stateOf(newcomer);
    assert.equal(afterResults.noviceCountedGames, 1, 'the FINAL game is counted');
    assert.equal(afterResults.noviceRank, 1, 'Newcomer → Debut');
    assert.equal(afterResults.noviceDebutGameId, resultsGame.id);
    assert.equal(afterResults.noviceDebutHostUserId, host, 'the OWNER is the debut host');
    assert.ok(
      (await achievementIds(host)).includes('habit_talent_scout_1'),
      'the host earns Talent Scout',
    );
    // Every fresh account is a Newcomer, so all three other players debuted here.
    assert.equal(await countNewcomersDebutedBy(host), 3, '"brought 3 new players"');
    assert.equal((await stateOf(playerA)).noviceDebutHostUserId, host);
    const hostState = await stateOf(host);
    assert.equal(hostState.noviceDebutHostUserId, null, 'the owner gets no self-credit');

    // Idempotent: recounting again changes nothing and grants nothing twice.
    await onGameEndedForNovice(resultsGame.id);
    await refreshNoviceProgressForUser(newcomer);
    assert.deepEqual(await stateOf(newcomer), afterResults, 'recount is idempotent');
    const scoutRows = await prisma.userAchievement.count({
      where: { userId: host, definitionId: 'habit_talent_scout_1' },
    });
    assert.equal(scoutRows, 1, 'Talent Scout is granted once');

    // -----------------------------------------------------------------------
    // EVENT, no-show and unfinished games never count
    // -----------------------------------------------------------------------
    const eventGame = await makeGame({
      entityType: 'EVENT',
      status: 'FINISHED',
      ownerId: playerA,
      players: [{ userId: newcomer }],
      startOffsetHours: -48,
    });
    await onGameEndedForNovice(eventGame);
    const noShowTraining = await makeGame({
      entityType: 'TRAINING',
      status: 'FINISHED',
      ownerId: playerA,
      players: [{ userId: newcomer, noShow: true }],
      startOffsetHours: -40,
    });
    await onGameEndedForNovice(noShowTraining);
    const upcomingTraining = await makeGame({
      entityType: 'TRAINING',
      status: 'ANNOUNCED',
      ownerId: playerA,
      players: [{ userId: newcomer }],
      startOffsetHours: 24,
    });
    await refreshNoviceProgressForUser(newcomer);
    assert.equal((await stateOf(newcomer)).noviceCountedGames, 1, 'EVENT / no-show / upcoming do not count');
    assert.equal(upcomingTraining.length > 0, true);

    // -----------------------------------------------------------------------
    // TRAINING / BAR FINISHED → rank; Regular → Ambassador for the debut host
    // -----------------------------------------------------------------------
    for (const [i, entityType] of (['TRAINING', 'BAR', 'TRAINING', 'TRAINING'] as const).entries()) {
      const gameId = await makeGame({
        entityType,
        status: i === 3 ? 'ARCHIVED' : 'FINISHED',
        ownerId: playerB,
        players: [{ userId: newcomer }],
        startOffsetHours: -30 + i,
      });
      await onGameEndedForNovice(gameId);
      assert.equal((await stateOf(newcomer)).noviceRank, 2 + i, `rank ${2 + i} after ${entityType}`);
    }
    const regular = await stateOf(newcomer);
    assert.equal(regular.noviceCountedGames, 5);
    assert.equal(regular.noviceRank, 5, 'Regular at 5 counted games');
    assert.equal(regular.noviceDebutHostUserId, host, 'the debut host never moves');
    assert.ok((await achievementIds(host)).includes('habit_ambassador_1'), 'the host earns Ambassador');
    assert.ok(
      !(await achievementIds(playerB)).some((id) => id.startsWith('habit_talent_scout')),
      'hosting later games is not a debut',
    );

    // Undoing a result lowers the honest count but never the rank.
    await prisma.gameParticipant.updateMany({
      where: { gameId: { in: createdGameIds }, userId: newcomer, game: { entityType: 'BAR' } },
      data: { noShowNotedAt: new Date() },
    });
    await refreshNoviceProgressForUser(newcomer);
    const demotedCount = await stateOf(newcomer);
    assert.equal(demotedCount.noviceCountedGames, 4);
    assert.equal(demotedCount.noviceRank, 5, 'rank is monotonic');

    // -----------------------------------------------------------------------
    // Self-hosted debut: no host credit
    // -----------------------------------------------------------------------
    const selfHost = await makeUser('SelfHost');
    const selfGame = await makeGame({
      entityType: 'TRAINING',
      status: 'FINISHED',
      ownerId: selfHost,
      players: [{ userId: playerA }],
      startOffsetHours: -10,
    });
    await onGameEndedForNovice(selfGame);
    const selfState = await stateOf(selfHost);
    assert.equal(selfState.noviceRank, 1);
    assert.equal(selfState.noviceDebutGameId, selfGame);
    assert.equal(selfState.noviceDebutHostUserId, null, 'no self-credit');

    // -----------------------------------------------------------------------
    // Milestone-seen clamp + unlock-all
    // -----------------------------------------------------------------------
    assert.equal((await markNoviceMilestoneSeen(selfHost, 4))?.noviceMilestoneSeenRank, 1, 'clamped to rank');
    assert.equal((await markNoviceMilestoneSeen(selfHost, 0))?.noviceMilestoneSeenRank, 1, 'never lowered');
    const unlocked = await unlockAllNoviceFeatures(selfHost);
    assert.ok(unlocked?.noviceUnlockedAllAt, 'unlock-all stamps the time');
    const unlockedAgain = await unlockAllNoviceFeatures(selfHost);
    assert.equal(
      unlockedAgain?.noviceUnlockedAllAt?.getTime(),
      unlocked?.noviceUnlockedAllAt?.getTime(),
      'unlock-all keeps the first timestamp',
    );
    assert.equal((await getNoviceState(selfHost))?.noviceRank, 1, 'unlock-all does not touch the rank');

    console.log('noviceProgress.integration.test.ts: all assertions passed');
  } finally {
    await prisma.userAchievement.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.updateMany({
      where: { id: { in: createdUserIds } },
      data: { noviceDebutHostUserId: null, noviceDebutGameId: null },
    });
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    if (cityId) await prisma.city.deleteMany({ where: { id: cityId } });
    await prisma.$disconnect();
  }
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
