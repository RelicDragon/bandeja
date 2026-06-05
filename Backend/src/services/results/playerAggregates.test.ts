import assert from 'node:assert/strict';
import { Gender, WinnerOfGame } from '@prisma/client';
import { getSportConfig } from '../../sport/sportRegistry';
import { Sports } from '../../sport/sportIds';
import {
  buildAggregatesFromRoundResults,
  buildHeadToHeadFromRoundResults,
  comparePlayerAggregates,
  type HeadToHeadMap,
  type PlayerAggregate,
  type RoundResultForAggregates,
} from './playerAggregates';
import {
  applyPlacementToOutcomes,
  computePlacementFromAggregates,
  orderPlayerIdsByWinnerRule,
} from './outcomePlacement';
import { applySharedPlacementToOutcomes, type OutcomePlacementInput } from './outcomeComputation';
import type { GameOutcomeResult } from './calculator.service';

function stubRatingOutcomes(players: Array<{ userId: string }>): GameOutcomeResult[] {
  return players.map((p) => ({
    userId: p.userId,
    levelChange: 0,
    reliabilityChange: 0,
    pointsEarned: 0,
    isWinner: false,
    wins: 0,
    ties: 0,
    losses: 0,
    scoresMade: 0,
    scoresLost: 0,
  }));
}

function assertPlacementMatchesRating(
  label: string,
  players: Array<{ userId: string; level: number }>,
  roundResults: RoundResultForAggregates[],
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number,
  placementInput: OutcomePlacementInput = {},
  expectedFirst?: string,
): void {
  const playerIds = players.map((p) => p.userId);
  const aggregates = buildAggregatesFromRoundResults(players, roundResults);
  const h2h = buildHeadToHeadFromRoundResults(playerIds, roundResults);
  const ordered = orderPlayerIdsByWinnerRule(aggregates, h2h, {
    winnerOfGame,
    pointsPerWin,
    pointsPerTie,
    pointsPerLoose,
  });
  const placement = computePlacementFromAggregates(aggregates, h2h, {
    winnerOfGame,
    pointsPerWin,
    pointsPerTie,
    pointsPerLoose,
    hasFixedTeams: placementInput.hasFixedTeams ?? false,
    genderTeams: placementInput.genderTeams ?? null,
    fixedTeams: placementInput.fixedTeams,
    userGenderById: placementInput.userGenderById,
  });
  const merged = applySharedPlacementToOutcomes(
    players,
    roundResults,
    winnerOfGame,
    pointsPerWin,
    pointsPerTie,
    pointsPerLoose,
    stubRatingOutcomes(players),
    placementInput,
  );
  if (expectedFirst) {
    assert.equal(ordered[0], expectedFirst, `${label}: expected first`);
  }
  for (const winnerId of placement.winnerUserIds) {
    assert.equal(
      merged.find((o) => o.userId === winnerId)?.isWinner,
      true,
      `${label}: placement winner ${winnerId} isWinner on rating merge`,
    );
  }
  assert.equal(
    merged.find((o) => o.userId === ordered[0])?.isWinner,
    placement.winnerUserIds.has(ordered[0]!),
    `${label}: top ordered player isWinner matches placement`,
  );
}

/** Legacy calculator tie-break: matchesWon then scoresDelta only. */
function legacyByMatchesWonOrder(aggregates: Map<string, PlayerAggregate>): string[] {
  return [...aggregates.values()]
    .sort((a, b) => {
      const matchesDiff = b.matchesWon - a.matchesWon;
      if (matchesDiff !== 0) return matchesDiff;
      return b.scoresDelta - a.scoresDelta;
    })
    .map((p) => p.userId);
}

{
  const aggregates = new Map<string, PlayerAggregate>([
    [
      'a',
      {
        userId: 'a',
        level: 3,
        matchesWon: 2,
        wins: 2,
        ties: 1,
        losses: 0,
        totalPoints: 0,
        scoresDelta: 3,
      },
    ],
    [
      'b',
      {
        userId: 'b',
        level: 3,
        matchesWon: 2,
        wins: 2,
        ties: 0,
        losses: 0,
        totalPoints: 0,
        scoresDelta: 10,
      },
    ],
  ]);
  const h2h = new Map<string, Map<string, 'A' | 'B' | 'tie' | null>>();
  const legacyFirst = legacyByMatchesWonOrder(aggregates)[0];
  const sharedFirst = orderPlayerIdsByWinnerRule(aggregates, h2h, {
    winnerOfGame: WinnerOfGame.BY_MATCHES_WON,
    pointsPerWin: 0,
    pointsPerTie: 0,
    pointsPerLoose: 0,
  })[0];
  assert.equal(legacyFirst, 'b', 'legacy prefers higher scoresDelta on tied matchesWon');
  assert.equal(sharedFirst, 'a', 'shared prefers more ties on tied matchesWon');
  assert.notEqual(legacyFirst, sharedFirst, 'BY_MATCHES_WON divergence reproduced');
}

const byPointsRound: RoundResultForAggregates[] = [
  {
    matches: [
      {
        teams: [
          { teamId: 't1', teamNumber: 1, score: 10, playerIds: ['p1'] },
          { teamId: 't2', teamNumber: 2, score: 5, playerIds: ['p2'] },
        ],
        winnerId: 't1',
      },
      {
        teams: [
          { teamId: 't3', teamNumber: 1, score: 11, playerIds: ['p1'] },
          { teamId: 't4', teamNumber: 2, score: 8, playerIds: ['p2'] },
        ],
        winnerId: 't1',
      },
    ],
  },
];

{
  const players = [
    { userId: 'p1', level: 2 },
    { userId: 'p2', level: 2 },
  ];
  const aggregates = buildAggregatesFromRoundResults(players, byPointsRound);
  const h2h = buildHeadToHeadFromRoundResults(['p1', 'p2'], byPointsRound);
  const placement = computePlacementFromAggregates(aggregates, h2h, {
    winnerOfGame: WinnerOfGame.BY_POINTS,
    pointsPerWin: 3,
    pointsPerTie: 1,
    pointsPerLoose: 0,
    hasFixedTeams: false,
    genderTeams: null,
  });
  const ratingOutcomes = players.map((p) => ({
    userId: p.userId,
    levelChange: 0.05,
    reliabilityChange: 0,
    pointsEarned: 3,
    isWinner: false,
    wins: 1,
    ties: 0,
    losses: 1,
    scoresMade: 0,
    scoresLost: 0,
  }));
  const merged = applySharedPlacementToOutcomes(
    players,
    byPointsRound,
    WinnerOfGame.BY_POINTS,
    3,
    1,
    0,
    ratingOutcomes,
  );
  const ordered = orderPlayerIdsByWinnerRule(aggregates, h2h, {
    winnerOfGame: WinnerOfGame.BY_POINTS,
    pointsPerWin: 3,
    pointsPerTie: 1,
    pointsPerLoose: 0,
  });
  assert.equal(ordered[0], 'p1', 'BY_POINTS shared order');
  assert.equal(merged.find((o) => o.userId === ordered[0])?.isWinner, true, 'BY_POINTS placement winner matches rating merge');
  assert.equal(placement.winnerUserIds.has(ordered[0]!), true, 'BY_POINTS placement winners match comparator order');
}

const byScoresDeltaRound: RoundResultForAggregates[] = [
  {
    matches: [
      {
        teams: [
          { teamId: 't1', teamNumber: 1, score: 11, playerIds: ['x'] },
          { teamId: 't2', teamNumber: 2, score: 9, playerIds: ['y'] },
        ],
        winnerId: 't1',
      },
      {
        teams: [
          { teamId: 't3', teamNumber: 1, score: 8, playerIds: ['x'] },
          { teamId: 't4', teamNumber: 2, score: 10, playerIds: ['y'] },
        ],
        winnerId: 't4',
      },
    ],
  },
];

{
  const players = [
    { userId: 'x', level: 4 },
    { userId: 'y', level: 4.5 },
  ];
  const aggregates = buildAggregatesFromRoundResults(players, byScoresDeltaRound);
  const h2h = buildHeadToHeadFromRoundResults(['x', 'y'], byScoresDeltaRound);
  const ordered = orderPlayerIdsByWinnerRule(aggregates, h2h, {
    winnerOfGame: WinnerOfGame.BY_SCORES_DELTA,
    pointsPerWin: 0,
    pointsPerTie: 0,
    pointsPerLoose: 0,
  });
  const aggX = aggregates.get('x')!;
  const aggY = aggregates.get('y')!;
  assert.ok(
    comparePlayerAggregates(aggX, aggY, WinnerOfGame.BY_SCORES_DELTA, 0, 0, 0, h2h.get('x')?.get('y') ?? null) < 0,
    'BY_SCORES_DELTA comparator ranks x above y on equal delta via level',
  );
  assert.equal(ordered[0], 'x', 'BY_SCORES_DELTA order uses shared comparator chain');
  assertPlacementMatchesRating(
    'BY_SCORES_DELTA',
    players,
    byScoresDeltaRound,
    WinnerOfGame.BY_SCORES_DELTA,
    0,
    0,
    0,
    {},
    'x',
  );
}

const byMatchesWonRound: RoundResultForAggregates[] = [
  {
    matches: [
      {
        teams: [
          { teamId: 't1', teamNumber: 1, score: 11, playerIds: ['w1'] },
          { teamId: 't2', teamNumber: 2, score: 7, playerIds: ['l1'] },
        ],
        winnerId: 't1',
      },
      {
        teams: [
          { teamId: 't3', teamNumber: 1, score: 11, playerIds: ['w1'] },
          { teamId: 't4', teamNumber: 2, score: 9, playerIds: ['l1'] },
        ],
        winnerId: 't3',
      },
    ],
  },
];

assertPlacementMatchesRating(
  'BY_MATCHES_WON',
  [
    { userId: 'w1', level: 3 },
    { userId: 'l1', level: 3 },
  ],
  byMatchesWonRound,
  WinnerOfGame.BY_MATCHES_WON,
  0,
  0,
  0,
  {},
  'w1',
);

{
  const tiedAggregate = (userId: string): PlayerAggregate => ({
    userId,
    level: 3,
    matchesWon: 2,
    wins: 2,
    ties: 0,
    losses: 0,
    totalPoints: 0,
    scoresDelta: 5,
  });
  const aggregates = new Map<string, PlayerAggregate>([
    ['p1', tiedAggregate('p1')],
    ['p2', tiedAggregate('p2')],
  ]);
  const h2h: HeadToHeadMap = new Map([
    ['p1', new Map<string, 'A' | 'B' | 'tie' | null>([['p2', 'A']])],
    ['p2', new Map<string, 'A' | 'B' | 'tie' | null>([['p1', 'B']])],
  ]);
  const ordered = orderPlayerIdsByWinnerRule(aggregates, h2h, {
    winnerOfGame: WinnerOfGame.BY_MATCHES_WON,
    pointsPerWin: 0,
    pointsPerTie: 0,
    pointsPerLoose: 0,
  });
  const placement = computePlacementFromAggregates(aggregates, h2h, {
    winnerOfGame: WinnerOfGame.BY_MATCHES_WON,
    pointsPerWin: 0,
    pointsPerTie: 0,
    pointsPerLoose: 0,
    hasFixedTeams: false,
    genderTeams: null,
  });
  assert.equal(ordered[0], 'p1', 'head-to-head: p1 ranks above p2 on direct result');
  assert.equal(placement.winnerUserIds.has('p1'), true, 'head-to-head: placement winner is p1');
  const ratingOutcomes = stubRatingOutcomes([{ userId: 'p1' }, { userId: 'p2' }]);
  const merged = applyPlacementToOutcomes(ratingOutcomes, placement);
  assert.equal(merged.find((o) => o.userId === ordered[0])?.isWinner, true, 'head-to-head: rating merge matches placement order');
}

const mixPairsRound: RoundResultForAggregates[] = [
  {
    matches: [
      {
        teams: [
          { teamId: 'mx1', teamNumber: 1, score: 11, playerIds: ['m1'] },
          { teamId: 'mx2', teamNumber: 2, score: 5, playerIds: ['m2'] },
        ],
        winnerId: 'mx1',
      },
      {
        teams: [
          { teamId: 'fx1', teamNumber: 1, score: 11, playerIds: ['f1'] },
          { teamId: 'fx2', teamNumber: 2, score: 6, playerIds: ['f2'] },
        ],
        winnerId: 'fx1',
      },
    ],
  },
];

{
  const mixPlayers = [
    { userId: 'm1', level: 3 },
    { userId: 'm2', level: 3 },
    { userId: 'f1', level: 3 },
    { userId: 'f2', level: 3 },
  ];
  const merged = applySharedPlacementToOutcomes(
    mixPlayers,
    mixPairsRound,
    WinnerOfGame.BY_MATCHES_WON,
    0,
    0,
    0,
    stubRatingOutcomes(mixPlayers),
    {
      hasFixedTeams: false,
      genderTeams: 'MIX_PAIRS',
      userGenderById: new Map<string, Gender | null>([
        ['m1', Gender.MALE],
        ['m2', Gender.MALE],
        ['f1', Gender.FEMALE],
        ['f2', Gender.FEMALE],
      ]),
    },
  );
  assert.equal(merged.find((o) => o.userId === 'm1')?.isWinner, true, 'MIX_PAIRS: top male is winner');
  assert.equal(merged.find((o) => o.userId === 'f1')?.isWinner, true, 'MIX_PAIRS: top female is winner');
  assert.equal(merged.find((o) => o.userId === 'm2')?.isWinner, false, 'MIX_PAIRS: second male not winner');
  assert.equal(merged.find((o) => o.userId === 'f2')?.isWinner, false, 'MIX_PAIRS: second female not winner');
}

const fixedTeamsRound: RoundResultForAggregates[] = [
  {
    matches: [
      {
        teams: [
          { teamId: 'ft1', teamNumber: 1, score: 10, playerIds: ['a1', 'a2'] },
          { teamId: 'ft2', teamNumber: 2, score: 4, playerIds: ['b1', 'b2'] },
        ],
        winnerId: 'ft1',
      },
    ],
  },
];

{
  const fixedPlayers = [
    { userId: 'a1', level: 3 },
    { userId: 'a2', level: 3 },
    { userId: 'b1', level: 3 },
    { userId: 'b2', level: 3 },
  ];
  const merged = applySharedPlacementToOutcomes(
    fixedPlayers,
    fixedTeamsRound,
    WinnerOfGame.BY_MATCHES_WON,
    0,
    0,
    0,
    stubRatingOutcomes(fixedPlayers),
    {
      hasFixedTeams: true,
      genderTeams: null,
      fixedTeams: [
        { id: 'teamA', teamNumber: 1, playerIds: ['a1', 'a2'] },
        { id: 'teamB', teamNumber: 2, playerIds: ['b1', 'b2'] },
      ],
    },
  );
  assert.equal(merged.find((o) => o.userId === 'a1')?.isWinner, true, 'fixed teams: team A player 1 is winner');
  assert.equal(merged.find((o) => o.userId === 'a2')?.isWinner, true, 'fixed teams: team A player 2 is winner');
  assert.equal(merged.find((o) => o.userId === 'b1')?.isWinner, false, 'fixed teams: team B player 1 not winner');
  assert.equal(merged.find((o) => o.userId === 'a1')?.position, 1, 'fixed teams: team A position 1');
  assert.equal(merged.find((o) => o.userId === 'b1')?.position, 2, 'fixed teams: team B position 2');
}

const padelEngine = getSportConfig(Sports.PADEL).ratingModel.engine;
assert.equal(padelEngine.ballsInGamesMargin, true, 'sport registry padel ballsInGamesMargin');
assert.equal(padelEngine.useScoreMargin, true, 'sport registry padel useScoreMargin');

console.log('playerAggregates.test.ts: ok');
