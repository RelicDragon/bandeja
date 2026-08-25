import assert from 'node:assert/strict';
import prisma from '../../config/database';
import {
  AVAILABLE_GAMES_DAY_INDEX_PAGE_SIZE,
  fetchAvailableGamesPage,
} from './availableGamesQuery';

const gameFindMany = prisma.game.findMany;
const participantFindMany = prisma.gameParticipant.findMany;
const cityFindUnique = prisma.city.findUnique;

const rows = Array.from({ length: AVAILABLE_GAMES_DAY_INDEX_PAGE_SIZE + 1 }, (_, index) => ({
  id: `g-${String(index).padStart(5, '0')}`,
  startTime: new Date(Date.UTC(2026, 7, 1, 0, 0, index)),
  sport: 'PADEL',
  entityType: 'GAME',
  minLevel: 1,
  maxLevel: 7,
  maxParticipants: 4,
  genderTeams: 'ANY',
  trainerId: null,
  clubId: 'club-1',
  isPublic: true,
  timeIsSet: true,
  affectsRating: true,
  court: null,
}));

async function run() {
  let gameQueryCount = 0;
  const capturedWhere: unknown[] = [];
  prisma.city.findUnique = (async () => ({ timezone: 'Europe/Belgrade' })) as never;
  prisma.gameParticipant.findMany = (async () => []) as never;
  prisma.game.findMany = (async (args: { where: unknown }) => {
    capturedWhere.push(args.where);
    gameQueryCount += 1;
    return gameQueryCount === 1 ? rows : rows.slice(AVAILABLE_GAMES_DAY_INDEX_PAGE_SIZE);
  }) as never;

  try {
    const baseOptions = {
      userId: 'viewer-1',
      userCityId: 'city-1',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      showArchived: true,
      primarySport: 'PADEL' as const,
      kind: 'calendar' as const,
      indexOnly: true,
    };
    const first = await fetchAvailableGamesPage(baseOptions, (game) => game);
    assert.equal(first.meta.dayIndex?.length, AVAILABLE_GAMES_DAY_INDEX_PAGE_SIZE);
    assert.equal(first.meta.dayIndexTruncated, true);
    assert.ok(first.meta.dayIndexNextCursor);
    assert.equal(first.meta.dayIndex?.[0].dateKey, '2026-08-01');

    const second = await fetchAvailableGamesPage(
      { ...baseOptions, cursor: first.meta.dayIndexNextCursor ?? undefined },
      (game) => game,
    );
    assert.deepEqual(second.meta.dayIndex?.map((row) => row.id), [
      rows[AVAILABLE_GAMES_DAY_INDEX_PAGE_SIZE].id,
    ]);
    assert.equal(second.meta.dayIndexTruncated, false);
    assert.equal(second.meta.dayIndexNextCursor, null);
    assert.equal(gameQueryCount, 2);
    assert.match(JSON.stringify(capturedWhere[1]), /startTime/);

    console.log('availableGamesDayIndex.pagination.integration.test.ts: ok');
  } finally {
    prisma.game.findMany = gameFindMany;
    prisma.gameParticipant.findMany = participantFindMany;
    prisma.city.findUnique = cityFindUnique;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
