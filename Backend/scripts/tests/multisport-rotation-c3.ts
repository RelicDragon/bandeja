import { Sport } from '@prisma/client';
import { getSportConfig } from '../../src/sport/sportRegistry';
import { validateGameForSport } from '../../src/utils/validators/validateGameForSport';
import { generateRandomRound } from '../../src/services/results/generation/random';
import { generateRatingRound } from '../../src/services/results/generation/rating';
import { ApiError } from '../../src/utils/ApiError';
import type { GenGame as Game } from '../../src/services/results/generation/types';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    console.error('FAIL: expected throw —', msg);
    process.exit(1);
  } catch (e) {
    if (!(e instanceof ApiError)) {
      console.error('FAIL: wrong error type —', msg, e);
      process.exit(1);
    }
  }
}

function mkUser(id: string, level = 3) {
  return { id, level, gender: 'MALE' as const };
}

function mkGame(playersPerMatch: 2 | 4, count: number): Game {
  const participants = Array.from({ length: count }, (_, i) => ({
    userId: `u${i}`,
    status: 'PLAYING' as const,
    user: mkUser(`u${i}`, 3 + (i % 3) * 0.3),
  }));
  return {
    id: 'g1',
    sport: Sport.PADEL,
    playersPerMatch,
    maxParticipants: count,
    participants,
    genderTeams: 'ANY',
    hasFixedTeams: false,
    gameCourts: [{ courtId: 'c1', order: 0 }],
    winnerOfGame: 'BY_SCORES_DELTA',
  } as Game;
}

function testSinglesAmericanoTeams(): void {
  const game = mkGame(2, 6);
  const initialSets = [{ teamA: 0, teamB: 0 }];
  const matches = generateRandomRound(game, [], initialSets);
  assert(matches.length >= 1, 'singles americano produces matches');
  for (const m of matches) {
    assert(m.teamA.length === 1 && m.teamB.length === 1, 'each side is one player');
    assert(m.teamA[0] !== m.teamB[0], 'opponents differ');
  }
}

function testDoublesAmericanoTeams(): void {
  const game = mkGame(4, 8);
  const initialSets = [{ teamA: 0, teamB: 0 }];
  const matches = generateRandomRound(game, [], initialSets);
  assert(matches.length >= 1, 'doubles americano produces matches');
  for (const m of matches) {
    assert(m.teamA.length === 2 && m.teamB.length === 2, 'each side is a pair');
  }
}

function testSinglesMexicanoTeams(): void {
  const game = mkGame(2, 4);
  const initialSets = [{ teamA: 0, teamB: 0 }];
  const matches = generateRatingRound(game, [], initialSets);
  assert(matches.length >= 1, 'singles mexicano produces matches');
  for (const m of matches) {
    assert(m.teamA.length === 1 && m.teamB.length === 1, 'mexicano singles 1v1');
  }
}

function testRotationRegistry(): void {
  assert(getSportConfig(Sport.TENNIS).rotationFormats.americano === false, 'tennis no americano');
  assert(getSportConfig(Sport.PICKLEBALL).rotationFormats.americano === true, 'pickleball americano');
  assert(
    getSportConfig(Sport.PICKLEBALL).allowedGameTypes.includes('AMERICANO'),
    'pickleball allows AMERICANO gameType',
  );
}

function testRotationValidation(): void {
  assertThrows(
    () =>
      validateGameForSport({
        sport: 'TENNIS',
        gameType: 'AMERICANO',
        matchGenerationType: 'RANDOM',
        playersPerMatch: 4,
        scoringPreset: 'POINTS_21',
      }),
    'tennis rejects americano',
  );

  validateGameForSport({
    sport: 'PICKLEBALL',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    scoringPreset: 'POINTS_21',
  });

  assertThrows(
    () =>
      validateGameForSport({
        sport: 'PICKLEBALL',
        matchGenerationType: 'RANDOM',
        playersPerMatch: 2,
        scoringPreset: 'POINTS_21',
      }),
    'pickleball americano requires doubles match size',
  );

  validateGameForSport({
    sport: 'PADEL',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 2,
    scoringPreset: 'POINTS_16',
  });

  assertThrows(
    () =>
      validateGameForSport({
        sport: 'PADEL',
        gameType: 'MEXICANO',
        matchGenerationType: 'RANDOM',
        playersPerMatch: 4,
        scoringPreset: 'POINTS_24',
      }),
    'padel MEXICANO vs RANDOM mismatch',
  );
}

function testPickleballAmericano4p(): void {
  const game = {
    ...mkGame(4, 8),
    sport: Sport.PICKLEBALL,
  } as Game;
  const matches = generateRandomRound(game, [], [{ teamA: 0, teamB: 0 }]);
  assert(matches.length >= 1, 'pickleball 4p americano');
}

function testBadmintonSingles2p(): void {
  const game = {
    ...mkGame(2, 6),
    sport: Sport.BADMINTON,
  } as Game;
  const matches = generateRandomRound(game, [], [{ teamA: 0, teamB: 0 }]);
  assert(matches.length >= 1, 'badminton 2p americano');
  for (const m of matches) {
    assert(m.teamA.length === 1 && m.teamB.length === 1, 'badminton singles 1v1');
  }
}

function main(): void {
  testRotationRegistry();
  testRotationValidation();
  testSinglesAmericanoTeams();
  testDoublesAmericanoTeams();
  testSinglesMexicanoTeams();
  testPickleballAmericano4p();
  testBadmintonSingles2p();
  console.log('multisport-rotation-c3: all passed');
}

main();
