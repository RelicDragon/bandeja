/**
 * PRD 349 — the Live-now privacy gate, ordering and caps. Pure: no DB.
 *
 * Run: `ts-node --transpile-only src/services/game/liveGamesFilter.test.ts`
 */
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import {
  appendStructuralFiltersToWhere,
  isLiveRailVisible,
  LIVE_RAIL_VISIBLE_WHERE,
  LIVE_RAIL_WHERE,
} from './availableGamesStructuralWhere';
import {
  clampLiveRailLimit,
  sortLiveRailGames,
  LIVE_RAIL_FIND_LIMIT,
  LIVE_RAIL_HOME_LIMIT,
  LIVE_RAIL_MAX_LIMIT,
} from './liveRailOrder';

/* ---------------- the gate ---------------- */
{
  // Public, or a league fixture of a public season — never anything else.
  assert.deepEqual(LIVE_RAIL_VISIBLE_WHERE, {
    showOnLiveRail: true,
    OR: [
      { isPublic: true },
      { entityType: 'LEAGUE', parentId: { not: null }, parent: { is: { isPublic: true } } },
    ],
  });
  assert.deepEqual(LIVE_RAIL_WHERE, { resultsStatus: 'IN_PROGRESS', ...LIVE_RAIL_VISIBLE_WHERE });

  const where = appendStructuralFiltersToWhere({ cityId: 'city-1' }, { liveOnly: true });
  const and = (where.AND ?? []) as Prisma.GameWhereInput[];

  assert.equal(where.cityId, 'city-1');
  const gate = and.find((clause) => 'resultsStatus' in clause);
  assert.ok(gate, 'liveOnly must contribute a clause');

  // Every condition is load-bearing; dropping any one of them exposes a
  // private or opted-out game on a public rail.
  assert.equal(gate.resultsStatus, 'IN_PROGRESS');
  assert.equal(gate.showOnLiveRail, true);
  assert.deepEqual(gate.OR, LIVE_RAIL_VISIBLE_WHERE.OR);
}

{
  // The in-memory twin agrees with the where clause, case by case.
  const base = {
    isPublic: false,
    showOnLiveRail: true,
    entityType: 'GAME',
    parentId: null,
    parent: null,
  };
  assert.equal(isLiveRailVisible({ ...base, isPublic: true }), true, 'public game');
  assert.equal(isLiveRailVisible(base), false, 'private game');
  assert.equal(
    isLiveRailVisible({ ...base, entityType: 'LEAGUE', parentId: 's', parent: { isPublic: true } }),
    true,
    'fixture of a public season',
  );
  assert.equal(
    isLiveRailVisible({ ...base, entityType: 'LEAGUE', parentId: 's', parent: { isPublic: false } }),
    false,
    'fixture of a private season',
  );
  assert.equal(
    isLiveRailVisible({ ...base, entityType: 'LEAGUE', parentId: null, parent: null }),
    false,
    'a parentless LEAGUE game is not a fixture',
  );
  assert.equal(
    isLiveRailVisible({ ...base, entityType: 'GAME', parentId: 's', parent: { isPublic: true } }),
    false,
    'only LEAGUE children inherit the season flag',
  );
  assert.equal(
    isLiveRailVisible({ ...base, isPublic: true, showOnLiveRail: false }),
    false,
    'opted out',
  );
  assert.equal(
    isLiveRailVisible({
      ...base,
      showOnLiveRail: false,
      entityType: 'LEAGUE',
      parentId: 's',
      parent: { isPublic: true },
    }),
    false,
    'an opted-out fixture stays off',
  );
}

{
  // Without `liveOnly` nothing is added — Find is untouched.
  const where = appendStructuralFiltersToWhere({ cityId: 'city-1' }, {});
  const and = (where.AND ?? []) as Prisma.GameWhereInput[];
  assert.equal(
    and.some((clause) => 'resultsStatus' in clause),
    false,
  );
}

{
  // The gate survives alongside other structural filters and is never nested
  // inside an OR that could let a private game through.
  const where = appendStructuralFiltersToWhere(
    { cityId: 'city-1' },
    { liveOnly: true, clubIds: ['club-1'], hideBar: true },
  );
  const and = (where.AND ?? []) as Prisma.GameWhereInput[];
  const gate = and.find((clause) => 'showOnLiveRail' in clause);
  assert.ok(gate);
  // The visibility OR lives *inside* the gate clause, so it can never widen a sibling filter.
  assert.deepEqual(gate.OR, LIVE_RAIL_VISIBLE_WHERE.OR);
  assert.equal(and.length >= 3, true);
}

/* ---------------- caps ---------------- */
{
  assert.equal(LIVE_RAIL_FIND_LIMIT, 10, 'Find shows at most 10 live cards');
  assert.equal(LIVE_RAIL_HOME_LIMIT, 3, 'Home shows at most 3 live cards');
  assert.ok(LIVE_RAIL_MAX_LIMIT >= LIVE_RAIL_FIND_LIMIT);

  assert.equal(clampLiveRailLimit(undefined), LIVE_RAIL_FIND_LIMIT);
  assert.equal(clampLiveRailLimit('3'), 3);
  assert.equal(clampLiveRailLimit(0), 1);
  assert.equal(clampLiveRailLimit(9999), LIVE_RAIL_MAX_LIMIT);
  assert.equal(clampLiveRailLimit('nonsense'), LIVE_RAIL_FIND_LIMIT);
}

/* ---------------- ordering ---------------- */
{
  const card = (
    id: string,
    startTime: string,
    viewerIsPlaying = false,
    followedSeason = false,
  ) => ({ id, startTime, viewerIsPlaying, followedSeason });

  const sorted = sortLiveRailGames([
    card('late-plain', '2026-09-20T12:00:00.000Z'),
    card('early-plain', '2026-09-20T09:00:00.000Z'),
    card('season', '2026-09-20T11:00:00.000Z', false, true),
    card('mine', '2026-09-20T13:00:00.000Z', true),
  ]);

  assert.deepEqual(
    sorted.map((c) => c.id),
    ['mine', 'season', 'early-plain', 'late-plain'],
    'viewer first, then followed-season fixtures, then by start time',
  );
}

{
  // Two followed-season fixtures still order by start time between themselves.
  const sorted = sortLiveRailGames([
    { id: 'b', startTime: '2026-09-20T12:00:00.000Z', viewerIsPlaying: false, followedSeason: true },
    { id: 'a', startTime: '2026-09-20T10:00:00.000Z', viewerIsPlaying: false, followedSeason: true },
  ]);
  assert.deepEqual(
    sorted.map((c) => c.id),
    ['a', 'b'],
  );
}

{
  // Live always leads; league fixtures beat casual games inside a phase;
  // finished cards run freshest first.
  const sorted = sortLiveRailGames([
    { id: 'done-old', phase: 'finished' as const, finishedAt: '2026-09-20T10:00:00.000Z', startTime: '2026-09-20T08:00:00.000Z', viewerIsPlaying: false, followedSeason: false },
    { id: 'done-new', phase: 'finished' as const, finishedAt: '2026-09-20T12:00:00.000Z', startTime: '2026-09-20T10:00:00.000Z', viewerIsPlaying: false, followedSeason: false },
    { id: 'done-league', phase: 'finished' as const, finishedAt: '2026-09-20T09:00:00.000Z', startTime: '2026-09-20T07:00:00.000Z', viewerIsPlaying: false, followedSeason: false, league: { name: 'L' } },
    { id: 'done-mine', phase: 'finished' as const, finishedAt: '2026-09-20T08:00:00.000Z', startTime: '2026-09-20T06:00:00.000Z', viewerIsPlaying: true, followedSeason: false },
    { id: 'live-plain', phase: 'live' as const, startTime: '2026-09-20T11:00:00.000Z', viewerIsPlaying: false, followedSeason: false },
    { id: 'live-league', phase: 'live' as const, startTime: '2026-09-20T12:00:00.000Z', viewerIsPlaying: false, followedSeason: false, league: { name: 'L' } },
  ]);
  assert.deepEqual(
    sorted.map((c) => c.id),
    ['live-league', 'live-plain', 'done-mine', 'done-league', 'done-new', 'done-old'],
  );
}

{
  // Sorting must not mutate the caller's array.
  const input = [
    { id: 'a', startTime: '2026-09-20T12:00:00.000Z', viewerIsPlaying: false, followedSeason: false },
    { id: 'b', startTime: '2026-09-20T10:00:00.000Z', viewerIsPlaying: false, followedSeason: false },
  ];
  sortLiveRailGames(input);
  assert.equal(input[0].id, 'a');
}

console.log('liveGamesFilter.test.ts: ok');
