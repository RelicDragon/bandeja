/**
 * PRD 352 — the apply/revert symmetry of the `PairStat` pipeline.
 *
 * The pipeline never stores signed deltas: `refreshPairStatsForPairs` recomputes
 * a pair from every counted game it can still see, and `writePairAggregates`
 * replaces the stored rows for exactly the pairs it recomputed. This test
 * exercises that algorithm end to end without a database by driving the same
 * pure functions the service composes:
 *
 *   games → detectPairGameFacts → aggregatePairFacts → rows
 *
 * "Writing an outcome" adds `GameOutcome` rows to a game; "resetting" removes
 * them (and, for generated formats, the `Team` rosters too). If the two
 * directions are symmetric, replaying the reduced world must land on exactly
 * the totals the pair had before the game existed.
 */

import { EntityType, ResultsStatus, Sport } from '@prisma/client';
import {
  detectPairGameFacts,
  isTechnicalGameMetadata,
  type PairDetectionGame,
} from './partnerDetection';
import { aggregatePairFacts, mergePairAggregates, type PairStatAggregate } from './pairStatAggregate';
import { pairKey } from './pairKey';
import { pairVisibleGameWhere } from './pairGameVisibility';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const ANA = 'user-ana';
const MARKO = 'user-marko';
const BEN = 'user-ben';
const ZORA = 'user-zora';

function finalGame(
  gameId: string,
  playedAt: string,
  winners: string[],
  overrides: Partial<PairDetectionGame> = {},
): PairDetectionGame {
  return {
    gameId,
    entityType: EntityType.GAME,
    resultsStatus: ResultsStatus.FINAL,
    sport: Sport.PADEL,
    cityId: 'city-1',
    playedAt: new Date(playedAt),
    hasFixedTeams: true,
    fixedTeams: [{ playerIds: [ANA, MARKO] }, { playerIds: [BEN, ZORA] }],
    matches: [],
    outcomeUserIds: [ANA, MARKO, BEN, ZORA],
    winnerUserIds: winners,
    technical: false,
    ...overrides,
  };
}

/** What the service would write for the given world. */
function materialize(games: readonly PairDetectionGame[]): Map<string, PairStatAggregate> {
  const rows = new Map<string, PairStatAggregate>();
  for (const game of games) {
    mergePairAggregates(rows, aggregatePairFacts(detectPairGameFacts(game)));
  }
  return rows;
}

function rowFor(rows: Map<string, PairStatAggregate>, a: string, b: string): PairStatAggregate | null {
  for (const row of rows.values()) {
    if (pairKey(row.userAId, row.userBId) === pairKey(a, b)) return row;
  }
  return null;
}

/** `GameOutcome` rows removed — what `undoGameOutcomes` leaves behind. */
function withOutcomesReset(game: PairDetectionGame): PairDetectionGame {
  return { ...game, outcomeUserIds: [], winnerUserIds: [], resultsStatus: ResultsStatus.NONE };
}

// ---------------------------------------------------------------------------
// Fixed teams: write, then reset
// ---------------------------------------------------------------------------

{
  const history = [
    finalGame('g1', '2026-01-05T18:00:00.000Z', [ANA, MARKO]),
    finalGame('g2', '2026-01-12T18:00:00.000Z', [BEN, ZORA]),
  ];
  const before = materialize(history);
  const anaMarkoBefore = rowFor(before, ANA, MARKO)!;
  assert(anaMarkoBefore.games === 2 && anaMarkoBefore.wins === 1, 'two games, one win before');
  assert(
    anaMarkoBefore.lastPlayedAt?.toISOString() === '2026-01-12T18:00:00.000Z',
    'lastPlayedAt is the newest counted game',
  );

  const newGame = finalGame('g3', '2026-02-01T18:00:00.000Z', [ANA, MARKO]);
  const afterWrite = materialize([...history, newGame]);
  const anaMarkoAfter = rowFor(afterWrite, ANA, MARKO)!;
  assert(anaMarkoAfter.games === 3 && anaMarkoAfter.wins === 2, 'the outcome write adds a win');
  assert(
    anaMarkoAfter.lastPlayedAt?.toISOString() === '2026-02-01T18:00:00.000Z',
    'the outcome write moves lastPlayedAt forward',
  );

  const afterReset = materialize([...history, withOutcomesReset(newGame)]);
  const anaMarkoReset = rowFor(afterReset, ANA, MARKO)!;
  assert(
    anaMarkoReset.games === anaMarkoBefore.games && anaMarkoReset.wins === anaMarkoBefore.wins,
    'reset restores the exact pre-write totals',
  );
  assert(
    anaMarkoReset.lastPlayedAt?.toISOString() === anaMarkoBefore.lastPlayedAt?.toISOString(),
    'reset restores lastPlayedAt — it is recomputed, not decremented',
  );
  assert(afterReset.size === before.size, 'reset leaves no extra rows behind');
}

// ---------------------------------------------------------------------------
// The last game together: the row must disappear, not linger at 0
// ---------------------------------------------------------------------------

{
  const only = finalGame('g-only', '2026-03-01T18:00:00.000Z', [ANA, MARKO]);
  assert(rowFor(materialize([only]), ANA, MARKO) !== null, 'the pair exists while the game counts');
  assert(
    rowFor(materialize([withOutcomesReset(only)]), ANA, MARKO) === null,
    'resetting the only shared game removes the pair entirely',
  );
  assert(materialize([withOutcomesReset(only)]).size === 0, 'no zero rows are left behind');
}

// ---------------------------------------------------------------------------
// Generated formats: a reset also drops the Team rosters
// ---------------------------------------------------------------------------

{
  const generated = finalGame('g-gen', '2026-03-08T18:00:00.000Z', [ANA, MARKO], {
    hasFixedTeams: false,
    fixedTeams: [],
    matches: [
      { teams: [{ playerIds: [ANA, MARKO] }, { playerIds: [BEN, ZORA] }] },
      { teams: [{ playerIds: [ANA, MARKO] }, { playerIds: [BEN, ZORA] }] },
    ],
  });

  const written = materialize([generated]);
  assert(rowFor(written, ANA, MARKO)?.wins === 1, 'the generated-format pair is written');
  assert(rowFor(written, BEN, ZORA)?.wins === 0, 'the losing side is written with zero wins');

  // `resetGameResults` deletes Team/TeamPlayer *and* the outcomes. Either loss
  // alone must already stop the game from counting.
  const rosterless: PairDetectionGame = { ...withOutcomesReset(generated), matches: [] };
  assert(materialize([rosterless]).size === 0, 'a reset generated-format game counts for nobody');
}

// ---------------------------------------------------------------------------
// Re-running the refresh is a no-op (idempotence)
// ---------------------------------------------------------------------------

{
  const history = [
    finalGame('g1', '2026-01-05T18:00:00.000Z', [ANA, MARKO]),
    finalGame('g2', '2026-01-12T18:00:00.000Z', [ANA, MARKO]),
  ];
  const once = materialize(history);
  const twice = materialize(history);
  const a = rowFor(once, ANA, MARKO)!;
  const b = rowFor(twice, ANA, MARKO)!;
  assert(a.games === b.games && a.wins === b.wins, 'a second refresh changes nothing');
  assert(a.games === 2 && a.wins === 2, 'recompute never double-counts a game');
}

// ---------------------------------------------------------------------------
// Batched rebuild == single-pass rebuild
// ---------------------------------------------------------------------------

{
  const history = [
    finalGame('g1', '2026-01-05T18:00:00.000Z', [ANA, MARKO]),
    finalGame('g2', '2026-01-12T18:00:00.000Z', [BEN, ZORA]),
    finalGame('g3', '2026-01-19T18:00:00.000Z', [ANA, MARKO]),
  ];

  const singlePass = new Map<string, PairStatAggregate>();
  mergePairAggregates(singlePass, aggregatePairFacts(history.flatMap(detectPairGameFacts)));

  const batched = new Map<string, PairStatAggregate>();
  for (const batch of [history.slice(0, 2), history.slice(2)]) {
    mergePairAggregates(batched, aggregatePairFacts(batch.flatMap(detectPairGameFacts)));
  }

  assert(batched.size === singlePass.size, 'batching does not change the row count');
  for (const [key, row] of singlePass) {
    const other = batched.get(key)!;
    assert(other.games === row.games && other.wins === row.wins, `batch totals match for ${key}`);
    assert(
      other.lastPlayedAt?.toISOString() === row.lastPlayedAt?.toISOString(),
      `batch lastPlayedAt matches for ${key}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Neutral technical league results never enter the pipeline
// ---------------------------------------------------------------------------

{
  assert(
    isTechnicalGameMetadata({ technicalWithdrawal: true, nonRallyOutcome: 'WALKOVER' }),
    'the walkover stamp is recognised',
  );
  assert(isTechnicalGameMetadata({ nonRallyOutcome: 'WALKOVER' }), 'a bare walkover is recognised');
  assert(!isTechnicalGameMetadata({ someOtherFlag: true }), 'ordinary metadata is not technical');
  assert(!isTechnicalGameMetadata(null), 'missing metadata is not technical');
  assert(!isTechnicalGameMetadata([1, 2, 3]), 'an array is not technical metadata');

  const technical = finalGame('g-wo', '2026-03-15T18:00:00.000Z', [ANA, MARKO], {
    entityType: EntityType.LEAGUE,
    technical: true,
  });
  assert(materialize([technical]).size === 0, 'a walkover contributes nothing to any pair');
}

/* ------------------------------------------------------------------ */
/* Pair sheet visibility — the named-games list is not the totals      */
/* ------------------------------------------------------------------ */

/*
 * `GET /rankings/pairs/:pairId` takes both user ids straight from the path, so
 * the recent-games list must be scoped to what the viewer could already open.
 * The *totals* deliberately still count private games (a count leaks nothing);
 * only the list that names a game, its club and its kick-off time is filtered.
 */
{
  const loadSource = readFileSync(path.join(__dirname, 'pairStatGameLoad.ts'), 'utf8');
  const counted = loadSource.slice(
    loadSource.indexOf('export function pairCountedGameWhere'),
    loadSource.indexOf('export {'),
  );
  assert(
    counted.length > 0 && !counted.includes('isPublic'),
    'the counted-games filter stays visibility-blind — private games keep counting',
  );

  const visible = pairVisibleGameWhere('viewer-1') as {
    OR?: Array<Record<string, unknown>>;
  };
  assert(Array.isArray(visible.OR) && visible.OR.length === 2, 'two visibility branches');
  assert(visible.OR![0].isPublic === true, 'public games are visible to anyone');
  assert(
    visible.OR![1].isPublic === false &&
      JSON.stringify(visible.OR![1].participants) ===
        JSON.stringify({ some: { userId: 'viewer-1' } }),
    'a private game is only named to someone on its roster',
  );

  const guest = pairVisibleGameWhere('') as { isPublic?: boolean; OR?: unknown };
  assert(guest.isPublic === true && guest.OR === undefined, 'no viewer means public only');

  // The pair sheet must actually apply it.
  const rankingSource = readFileSync(
    path.join(__dirname, 'pairRanking.service.ts'),
    'utf8',
  );
  assert(
    rankingSource.includes('pairVisibleGameWhere(viewerId)'),
    'loadRecentPairGames must filter the candidate games by viewer visibility',
  );
}

console.log('pairStatPipeline.test.ts OK');
