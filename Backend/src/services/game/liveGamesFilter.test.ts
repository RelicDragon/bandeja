/**
 * PRD 349 — the Live-now privacy gate, ordering and caps. Pure: no DB.
 *
 * Run: `ts-node --transpile-only src/services/game/liveGamesFilter.test.ts`
 */
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import {
  appendStructuralFiltersToWhere,
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
  assert.deepEqual(LIVE_RAIL_WHERE, {
    resultsStatus: 'IN_PROGRESS',
    isPublic: true,
    showOnLiveRail: true,
  });

  const where = appendStructuralFiltersToWhere({ cityId: 'city-1' }, { liveOnly: true });
  const and = (where.AND ?? []) as Prisma.GameWhereInput[];

  assert.equal(where.cityId, 'city-1');
  const gate = and.find((clause) => 'resultsStatus' in clause);
  assert.ok(gate, 'liveOnly must contribute a clause');

  // All three conditions are load-bearing; dropping any one of them exposes a
  // private or opted-out game on a public rail.
  assert.equal(gate.resultsStatus, 'IN_PROGRESS');
  assert.equal(gate.isPublic, true);
  assert.equal(gate.showOnLiveRail, true);
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
  assert.equal(gate.isPublic, true);
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
  // Sorting must not mutate the caller's array.
  const input = [
    { id: 'a', startTime: '2026-09-20T12:00:00.000Z', viewerIsPlaying: false, followedSeason: false },
    { id: 'b', startTime: '2026-09-20T10:00:00.000Z', viewerIsPlaying: false, followedSeason: false },
  ];
  sortLiveRailGames(input);
  assert.equal(input[0].id, 'a');
}

console.log('liveGamesFilter.test.ts: ok');
