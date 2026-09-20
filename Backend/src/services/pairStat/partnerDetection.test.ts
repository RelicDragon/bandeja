/**
 * PRD 352 — partner detection fixtures.
 *
 * Covers fixed-team games, generated formats, the majority-of-matches rule, the
 * entity-type and technical exclusions, and the `userAId < userBId` ordering
 * invariant that keeps `PairStat` from growing mirrored duplicate rows.
 */

import { EntityType, ResultsStatus, Sport } from '@prisma/client';
import {
  detectPairGameFacts,
  isMajorityPartnership,
  isPairCountedEntityType,
  isPairCountedGame,
  pairPartnerCandidates,
  sumPairFacts,
  type PairDetectionGame,
  type PairGameFact,
} from './partnerDetection';
import { pairCombinations, pairKey, orderPairIds } from './pairKey';
import { aggregatePairFacts } from './pairStatAggregate';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// Deliberately NOT in alphabetical order, so anything that forgets to normalize
// the pair order produces a visibly wrong key.
const ANA = 'ckuser000000000000000ana';
const MARKO = 'ckuser00000000000marko';
const ZORA = 'ckuser0000000000000zora';
const BEN = 'ckuser00000000000000ben';

const PLAYED_AT = new Date('2026-03-01T18:00:00.000Z');

function game(overrides: Partial<PairDetectionGame> = {}): PairDetectionGame {
  return {
    gameId: 'game-1',
    entityType: EntityType.GAME,
    resultsStatus: ResultsStatus.FINAL,
    sport: Sport.PADEL,
    cityId: 'city-1',
    playedAt: PLAYED_AT,
    hasFixedTeams: false,
    fixedTeams: [],
    matches: [],
    outcomeUserIds: [],
    winnerUserIds: [],
    technical: false,
    ...overrides,
  };
}

function keysOf(facts: readonly PairGameFact[]): string[] {
  return facts.map((fact) => pairKey(fact.userAId, fact.userBId)).sort();
}

// ---------------------------------------------------------------------------
// Ordering invariant
// ---------------------------------------------------------------------------

{
  const forward = orderPairIds(ZORA, ANA);
  const backward = orderPairIds(ANA, ZORA);
  assert(forward.userAId === backward.userAId, 'orderPairIds is symmetric on A');
  assert(forward.userBId === backward.userBId, 'orderPairIds is symmetric on B');
  assert(forward.userAId < forward.userBId, 'orderPairIds yields userAId < userBId');
}

{
  const combos = pairCombinations([ZORA, ANA, ZORA, MARKO]);
  assert(combos.length === 3, 'duplicate ids collapse to one player');
  for (const combo of combos) {
    assert(combo.userAId < combo.userBId, `combination ${combo.userAId}/${combo.userBId} ordered`);
  }
}

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

{
  assert(isPairCountedEntityType(EntityType.GAME), 'GAME counts');
  assert(isPairCountedEntityType(EntityType.TOURNAMENT), 'TOURNAMENT counts');
  assert(isPairCountedEntityType(EntityType.LEAGUE), 'LEAGUE counts');
  assert(!isPairCountedEntityType(EntityType.EVENT), 'EVENT excluded');
  assert(!isPairCountedEntityType(EntityType.BAR), 'BAR excluded');
  assert(!isPairCountedEntityType(EntityType.TRAINING), 'TRAINING excluded');
  assert(!isPairCountedEntityType(EntityType.LEAGUE_SEASON), 'LEAGUE_SEASON excluded');
}

{
  assert(!isPairCountedGame(game({ resultsStatus: ResultsStatus.NONE })), 'non-FINAL excluded');
  assert(
    !isPairCountedGame(game({ resultsStatus: ResultsStatus.IN_PROGRESS })),
    'IN_PROGRESS results excluded',
  );
  assert(isPairCountedGame(game()), 'FINAL GAME counted');
  assert(!isPairCountedGame(game({ technical: true })), 'neutral technical result excluded');
}

{
  const excluded = game({
    entityType: EntityType.TRAINING,
    hasFixedTeams: true,
    fixedTeams: [{ playerIds: [ANA, MARKO] }],
    outcomeUserIds: [ANA, MARKO],
    winnerUserIds: [ANA, MARKO],
  });
  assert(detectPairGameFacts(excluded).length === 0, 'TRAINING produces no pair facts');
}

// ---------------------------------------------------------------------------
// Fixed teams
// ---------------------------------------------------------------------------

{
  const fixed = game({
    hasFixedTeams: true,
    fixedTeams: [{ playerIds: [ZORA, ANA] }, { playerIds: [MARKO, BEN] }],
    matches: [
      { teams: [{ playerIds: [ZORA, ANA] }, { playerIds: [MARKO, BEN] }] },
      { teams: [{ playerIds: [ZORA, ANA] }, { playerIds: [MARKO, BEN] }] },
    ],
    outcomeUserIds: [ZORA, ANA, MARKO, BEN],
    winnerUserIds: [ZORA, ANA],
  });

  const facts = detectPairGameFacts(fixed);
  assert(facts.length === 2, 'one fact per fixed team, not per match');
  assert(
    keysOf(facts).join() === [pairKey(ZORA, ANA), pairKey(MARKO, BEN)].sort().join(),
    'both fixed teams produce a pair',
  );

  const winner = facts.find((fact) => pairKey(fact.userAId, fact.userBId) === pairKey(ZORA, ANA));
  const loser = facts.find((fact) => pairKey(fact.userAId, fact.userBId) === pairKey(MARKO, BEN));
  assert(winner!.won, 'the winning fixed team won');
  assert(!loser!.won, 'the losing fixed team did not win');
  for (const fact of facts) {
    assert(fact.userAId < fact.userBId, 'fact ids keep the ordering invariant');
    assert(fact.sport === Sport.PADEL && fact.cityId === 'city-1', 'fact carries sport and city');
  }
}

{
  // A fixed team whose partner never received an outcome row: the pair cannot
  // be scored, so it must not be counted at all.
  const partial = game({
    hasFixedTeams: true,
    fixedTeams: [{ playerIds: [ZORA, ANA] }],
    outcomeUserIds: [ZORA],
    winnerUserIds: [ZORA],
  });
  assert(detectPairGameFacts(partial).length === 0, 'a pair with one outcome row is skipped');
}

{
  // Only one of the two has `isWinner`: a "win" needs both sides of the pair.
  const split = game({
    hasFixedTeams: true,
    fixedTeams: [{ playerIds: [ZORA, ANA] }],
    outcomeUserIds: [ZORA, ANA],
    winnerUserIds: [ZORA],
  });
  const [fact] = detectPairGameFacts(split);
  assert(!!fact && !fact.won, 'half a winning pair is not a win');
}

// ---------------------------------------------------------------------------
// Generated formats — the majority rule
// ---------------------------------------------------------------------------

{
  assert(isMajorityPartnership(2, 3), '2 of 3 is a majority');
  assert(!isMajorityPartnership(1, 2), '1 of 2 is not a majority');
  assert(!isMajorityPartnership(1, 3), '1 of 3 is not a majority');
  assert(isMajorityPartnership(3, 4), '3 of 4 is a majority');
  assert(!isMajorityPartnership(2, 4), 'an even split is not a majority');
  assert(!isMajorityPartnership(1, 0), 'no shared matches is never a majority');
}

{
  // Americano: four players, three rounds, everyone partners everyone once.
  // Nobody reaches a majority, so the game contributes no pairs at all.
  const americano = game({
    gameId: 'game-americano',
    matches: [
      { teams: [{ playerIds: [ZORA, ANA] }, { playerIds: [MARKO, BEN] }] },
      { teams: [{ playerIds: [ZORA, MARKO] }, { playerIds: [ANA, BEN] }] },
      { teams: [{ playerIds: [ZORA, BEN] }, { playerIds: [ANA, MARKO] }] },
    ],
    outcomeUserIds: [ZORA, ANA, MARKO, BEN],
    winnerUserIds: [ZORA],
  });
  assert(detectPairGameFacts(americano).length === 0, 'a rotating americano ranks no pair');
}

{
  // Same four players, but two of them stay together for 2 of the 3 rounds.
  const mostlyTogether = game({
    gameId: 'game-mixed',
    matches: [
      { teams: [{ playerIds: [ZORA, ANA] }, { playerIds: [MARKO, BEN] }] },
      { teams: [{ playerIds: [ZORA, ANA] }, { playerIds: [MARKO, BEN] }] },
      { teams: [{ playerIds: [ZORA, MARKO] }, { playerIds: [ANA, BEN] }] },
    ],
    outcomeUserIds: [ZORA, ANA, MARKO, BEN],
    winnerUserIds: [ZORA, ANA],
  });

  const facts = detectPairGameFacts(mostlyTogether);
  assert(facts.length === 2, 'only the two majority partnerships count');
  assert(
    keysOf(facts).join() === [pairKey(ZORA, ANA), pairKey(MARKO, BEN)].sort().join(),
    'the 2-of-3 partnerships are the ones detected',
  );
  const zoraAna = facts.find((f) => pairKey(f.userAId, f.userBId) === pairKey(ZORA, ANA))!;
  assert(zoraAna.won, 'the winning majority pair won');
  assert(facts.every((f) => f.gameId === 'game-mixed'), 'facts carry the game id');
}

{
  // The denominator is "matches both played", not "matches in the game". A duo
  // that plays every one of its own matches together on court 1 still counts
  // while a second court runs in parallel.
  const twoCourts = game({
    gameId: 'game-two-courts',
    matches: [
      { teams: [{ playerIds: [ZORA, ANA] }, { playerIds: ['x1', 'x2'] }] },
      { teams: [{ playerIds: [MARKO, BEN] }, { playerIds: ['x3', 'x4'] }] },
      { teams: [{ playerIds: [ZORA, ANA] }, { playerIds: ['x3', 'x4'] }] },
      { teams: [{ playerIds: [MARKO, BEN] }, { playerIds: ['x1', 'x2'] }] },
    ],
    outcomeUserIds: [ZORA, ANA, MARKO, BEN, 'x1', 'x2', 'x3', 'x4'],
    winnerUserIds: [ZORA, ANA],
  });
  const detected = keysOf(detectPairGameFacts(twoCourts));
  assert(detected.includes(pairKey(ZORA, ANA)), 'court-1 duo counts despite a parallel court');
  assert(detected.includes(pairKey(MARKO, BEN)), 'court-2 duo counts too');
}

{
  // A pair counts at most once per game even with many matches together.
  const marathon = game({
    matches: Array.from({ length: 6 }, () => ({
      teams: [{ playerIds: [ZORA, ANA] }, { playerIds: [MARKO, BEN] }],
    })),
    outcomeUserIds: [ZORA, ANA, MARKO, BEN],
    winnerUserIds: [MARKO, BEN],
  });
  const facts = detectPairGameFacts(marathon);
  assert(facts.length === 2, 'six matches still yield one fact per pair');
  assert(new Set(keysOf(facts)).size === 2, 'no duplicate pair facts');
}

// ---------------------------------------------------------------------------
// Refresh candidates
// ---------------------------------------------------------------------------

{
  const candidates = pairPartnerCandidates({
    hasFixedTeams: true,
    fixedTeams: [{ playerIds: [ZORA, ANA] }],
    matches: [{ teams: [{ playerIds: [MARKO, BEN] }] }],
  });
  const keys = candidates.map((ids) => pairKey(ids.userAId, ids.userBId)).sort();
  assert(keys.length === 2, 'candidates span fixed teams and match teams');
  assert(keys.join() === [pairKey(ZORA, ANA), pairKey(MARKO, BEN)].sort().join(), 'candidate keys');
  for (const ids of candidates) {
    assert(ids.userAId < ids.userBId, 'candidates keep the ordering invariant');
  }
}

// ---------------------------------------------------------------------------
// Summing
// ---------------------------------------------------------------------------

{
  const earlier = new Date('2026-01-01T10:00:00.000Z');
  const later = new Date('2026-02-01T10:00:00.000Z');
  const ids = orderPairIds(ZORA, ANA);
  const facts: PairGameFact[] = [
    { ...ids, gameId: 'g1', sport: Sport.PADEL, cityId: 'city-1', playedAt: later, won: true },
    { ...ids, gameId: 'g2', sport: Sport.PADEL, cityId: 'city-1', playedAt: earlier, won: false },
  ];
  const totals = sumPairFacts(facts);
  assert(totals.games === 2 && totals.wins === 1, 'sum counts games and wins');
  assert(totals.lastPlayedAt?.getTime() === later.getTime(), 'lastPlayedAt is the newest game');

  const crossCity: PairGameFact[] = [
    ...facts,
    { ...ids, gameId: 'g3', sport: Sport.PADEL, cityId: 'city-2', playedAt: later, won: true },
  ];
  const aggregates = aggregatePairFacts(crossCity);
  assert(aggregates.length === 2, 'a pair playing in two cities gets two PairStat rows');
  assert(
    aggregates.every((row) => row.userAId < row.userBId),
    'aggregates keep the ordering invariant',
  );
}

console.log('partnerDetection.test.ts OK');
