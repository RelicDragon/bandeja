import assert from 'node:assert/strict';
import { WinnerOfGame } from '@prisma/client';
import { getSportConfig } from '../../sport/sportRegistry';
import { Sports } from '../../sport/sportIds';
import {
  buildAggregatesFromRoundResults,
  buildHeadToHeadFromRoundResults,
  comparePlayerAggregates,
  type PlayerAggregate,
  type RoundResultForAggregates,
} from './playerAggregates';
import { computePlacementFromAggregates, orderPlayerIdsByWinnerRule } from './outcomePlacement';
import { applySharedPlacementToOutcomes } from './outcomeComputation';

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
}

const padelEngine = getSportConfig(Sports.PADEL).ratingModel.engine;
assert.equal(padelEngine.ballsInGamesMargin, true, 'sport registry padel ballsInGamesMargin');
assert.equal(padelEngine.useScoreMargin, true, 'sport registry padel useScoreMargin');

console.log('playerAggregates.test.ts: ok');
