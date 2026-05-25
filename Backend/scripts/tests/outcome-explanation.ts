/**
 * Outcome explanation vs calculator alignment.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EntityType,
  MatchSetRole,
  Sport,
  WinnerOfGame,
  WinnerOfMatch,
} from '@prisma/client';
import { calculateByMatchesWonOutcomes } from '../../src/services/results/calculator.service';
import { buildOutcomeRatingExplanation } from '../../src/services/results/outcomeExplanation.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function readSrc(rel: string): string {
  return readFileSync(join(__dirname, '../../src', rel), 'utf8');
}

function makeUser(id: string, level: number) {
  return {
    firstName: id,
    lastName: 'User',
    reliability: 50,
    gamesPlayed: 20,
    sportProfiles: [
      { sport: Sport.PADEL, level, reliability: 50, gamesPlayed: 20, gamesWon: 10 },
    ],
  };
}

function makeCompletedMatch(
  id: string,
  winnerTeamId: string,
  teamAPlayerIds: string[],
  teamBPlayerIds: string[],
  users: Record<string, ReturnType<typeof makeUser>>,
) {
  return {
    id,
    winnerId: winnerTeamId,
    teams: [
      {
        id: `${id}-t1`,
        teamNumber: 1,
        players: teamAPlayerIds.map((userId) => ({ userId, user: users[userId] })),
      },
      {
        id: `${id}-t2`,
        teamNumber: 2,
        players: teamBPlayerIds.map((userId) => ({ userId, user: users[userId] })),
      },
    ],
    sets: [
      { teamAScore: 6, teamBScore: 4, isTieBreak: false, role: MatchSetRole.OFFICIAL },
      { teamAScore: 6, teamBScore: 3, isTieBreak: false, role: MatchSetRole.OFFICIAL },
    ],
  };
}

function testSourceUsesCalculatorParity(): void {
  const src = readSrc('services/results/outcomeExplanation.service.ts');
  assert(
    src.includes('isPrismaMatchCountedForStandingsAndRating'),
    'explanation uses standings/rating match gate',
  );
  assert(
    src.includes('calculateReliabilityChange'),
    'explanation uses calculateReliabilityChange',
  );
  assert(
    !src.includes('RELIABILITY_INCREMENT'),
    'explanation avoids RELIABILITY_INCREMENT fallback',
  );
  assert(
    src.includes('existingOutcome.levelChange'),
    'explanation uses stored levelChange when outcome exists',
  );
  assert(
    src.includes('teamAverageLevelAtMatchStart'),
    'explanation tracks running team levels across matches',
  );
}

function testMultiMatchMatchesCalculator(): void {
  const users = {
    a: makeUser('a', 3.0),
    b: makeUser('b', 3.5),
    c: makeUser('c', 4.0),
    d: makeUser('d', 4.5),
  };

  const match1 = makeCompletedMatch('m1', 'm1-t1', ['a', 'b'], ['c', 'd'], users);
  const match2 = makeCompletedMatch('m2', 'm2-t1', ['a', 'c'], ['b', 'd'], users);

  const game = {
    sport: Sport.PADEL,
    entityType: EntityType.GAME,
    affectsRating: true,
    winnerOfGame: WinnerOfGame.BY_MATCHES_WON,
    ballsInGames: true,
    winnerOfMatch: WinnerOfMatch.BY_SETS,
    fixedNumberOfSets: 3,
    maxTotalPointsPerSet: null,
    maxPointsPerTeam: null,
    scoringPreset: null,
    hasGoldenPoint: false,
    pointsPerTie: 0,
    matchTimerEnabled: false,
    participants: Object.entries(users).map(([userId, user]) => ({ userId, user })),
    outcomes: [],
    rounds: [
      { roundNumber: 1, matches: [match1] },
      { roundNumber: 2, matches: [match2] },
    ],
  };

  const players = Object.entries(users).map(([userId, user]) => ({
    userId,
    level: user.sportProfiles![0].level,
    reliability: 50,
    gamesPlayed: 20,
  }));

  const roundResults = [match1, match2].map((match) => ({
    matches: [
      {
        teams: match.teams.map((team) => ({
          teamId: team.id,
          teamNumber: team.teamNumber,
          score: team.id === match.winnerId ? 2 : 0,
          playerIds: team.players.map((p) => p.userId),
        })),
        winnerId: match.winnerId,
        sets: match.sets.map((set) => ({
          teamAScore: set.teamAScore,
          teamBScore: set.teamBScore,
          isTieBreak: set.isTieBreak || false,
        })),
      },
    ],
  }));

  const { gameOutcomes } = calculateByMatchesWonOutcomes(players, roundResults, 0, 0, 0, true);
  const calculatorOutcome = gameOutcomes.find((o) => o.userId === 'a');
  assert(Boolean(calculatorOutcome), 'calculator produced outcome for player a');

  const explanation = buildOutcomeRatingExplanation(game, 'a', null);
  const matchSum = explanation.matches.reduce((sum, m) => sum + m.levelChange, 0);

  assert(
    Math.abs(explanation.levelChange - calculatorOutcome!.levelChange) < 0.0001,
    `total levelChange matches calculator (${explanation.levelChange} vs ${calculatorOutcome!.levelChange})`,
  );
  assert(
    Math.abs(matchSum - calculatorOutcome!.levelChange) < 0.0001,
    `per-match sum matches calculator (${matchSum} vs ${calculatorOutcome!.levelChange})`,
  );
  assert(
    explanation.summary.wins === calculatorOutcome!.wins &&
      explanation.summary.losses === calculatorOutcome!.losses &&
      explanation.summary.draws === calculatorOutcome!.ties,
    'W/L/D summary matches calculator',
  );
  assert(
    Math.abs(explanation.reliabilityChange - calculatorOutcome!.reliabilityChange) < 0.0001,
    'reliabilityChange matches calculator',
  );
  assert(explanation.matches.length === 2, 'player a played two rated matches');
}

function testStoredOutcomeOverridesTotals(): void {
  const users = {
    a: makeUser('a', 3.0),
    b: makeUser('b', 3.5),
    c: makeUser('c', 4.0),
    d: makeUser('d', 4.5),
  };
  const match1 = makeCompletedMatch('m1', 'm1-t1', ['a', 'b'], ['c', 'd'], users);

  const game = {
    sport: Sport.PADEL,
    entityType: EntityType.GAME,
    affectsRating: true,
    winnerOfGame: WinnerOfGame.BY_MATCHES_WON,
    ballsInGames: true,
    winnerOfMatch: WinnerOfMatch.BY_SETS,
    fixedNumberOfSets: 3,
    maxTotalPointsPerSet: null,
    maxPointsPerTeam: null,
    scoringPreset: null,
    hasGoldenPoint: false,
    pointsPerTie: 0,
    matchTimerEnabled: false,
    participants: Object.entries(users).map(([userId, user]) => ({ userId, user })),
    outcomes: [{ userId: 'a', levelBefore: 3.0, reliabilityBefore: 50 }],
    rounds: [{ roundNumber: 1, matches: [match1] }],
  };

  const explanation = buildOutcomeRatingExplanation(game, 'a', {
    levelBefore: 3.0,
    levelAfter: 3.08,
    levelChange: 0.08,
    reliabilityBefore: 50,
    reliabilityAfter: 50.4,
    reliabilityChange: 0.4,
    position: 1,
    wins: 1,
    ties: 0,
    losses: 0,
    metadata: null,
  });

  assert(explanation.levelChange === 0.08, 'uses stored levelChange');
  assert(explanation.reliabilityChange === 0.4, 'uses stored reliabilityChange');
  assert(explanation.summary.wins === 1 && explanation.summary.losses === 0, 'uses stored W/L');
}

function main(): void {
  testSourceUsesCalculatorParity();
  testMultiMatchMatchesCalculator();
  testStoredOutcomeOverridesTotals();
  console.log('outcome-explanation: OK');
}

main();
