import { Sport } from '@prisma/client';
import { getSportConfig } from '../../src/sport/sportRegistry';
import { validateGameForSport } from '../../src/utils/validators/validateGameForSport';
import { generateKingOfTheCourtRound } from '../../src/services/results/generation/kingOfTheCourt';
import { ApiError } from '../../src/utils/ApiError';
import type { GenGame as Game, GenRound as Round } from '../../src/services/results/generation/types';

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

function mkGame(count: number, courts: number): Game {
  const participants = Array.from({ length: count }, (_, i) => ({
    userId: `u${i}`,
    status: 'PLAYING' as const,
    user: mkUser(`u${i}`, 3 + (i % 4) * 0.2),
  }));
  const gameCourts = Array.from({ length: courts }, (_, i) => ({
    courtId: `c${i}`,
    order: i,
  }));
  return {
    id: 'g-kotc',
    sport: Sport.PADEL,
    playersPerMatch: 4,
    maxParticipants: count,
    participants,
    genderTeams: 'ANY',
    hasFixedTeams: false,
    gameCourts,
    winnerOfGame: 'BY_MATCHES_WON',
    matchGenerationType: 'KING_OF_COURT',
    gameType: 'KOTC',
    entityType: 'GAME',
  } as unknown as Game;
}

function testRotationFlags(): void {
  assert(getSportConfig(Sport.PADEL).rotationFormats.kotc === true, 'padel kotc');
  assert(getSportConfig(Sport.TENNIS).rotationFormats.kotc === false, 'tennis no kotc');
}

function testValidation(): void {
  validateGameForSport({
    sport: 'PADEL',
    gameType: 'KOTC',
    matchGenerationType: 'KING_OF_COURT',
    playersPerMatch: 4,
    scoringPreset: 'POINTS_11',
    maxParticipants: 12,
  });

  assertThrows(
    () =>
      validateGameForSport({
        sport: 'TENNIS',
        gameType: 'KOTC',
        matchGenerationType: 'KING_OF_COURT',
        playersPerMatch: 4,
        scoringPreset: 'POINTS_11',
      }),
    'tennis rejects kotc',
  );

  assertThrows(
    () =>
      validateGameForSport({
        sport: 'PADEL',
        gameType: 'KOTC',
        matchGenerationType: 'RANDOM',
        playersPerMatch: 4,
        scoringPreset: 'POINTS_11',
      }),
    'kotc gen mismatch',
  );
}

function testFirstRound(): void {
  const game = mkGame(12, 3);
  const initialSets = [{ teamA: 0, teamB: 0 }];
  const matches = generateKingOfTheCourtRound(game, [], initialSets);
  assert(matches.length === 3, 'first round fills 3 courts');
  const playing = new Set(matches.flatMap((m) => [...m.teamA, ...m.teamB]));
  assert(playing.size === 12, 'first round uses top 12 players');
  for (const m of matches) {
    assert(m.teamA.length === 2 && m.teamB.length === 2, 'doubles sides');
  }
}

function testChallengerPoolRound(): void {
  const game = mkGame(14, 3);
  const initialSets = [{ teamA: 0, teamB: 0 }];
  const round1Matches = generateKingOfTheCourtRound(game, [], initialSets);
  assert(round1Matches.length === 3, 'round1 court count');

  const round1: Round = {
    id: 'r1',
    matches: round1Matches.map((m, i) => ({
      ...m,
      sets: [{ teamA: i === 0 ? 11 : 8, teamB: i === 0 ? 7 : 11 }],
    })),
  };

  const round2Matches = generateKingOfTheCourtRound(game, [round1], initialSets);
  assert(round2Matches.length >= 1, 'round2 produces matches');
  const court0 = round2Matches[0];
  const kings = round1Matches[0].teamA;
  assert(
    kings.every((id) => court0.teamA.includes(id) || court0.teamB.includes(id)),
    'court0 kings return',
  );
}

function main(): void {
  testRotationFlags();
  testValidation();
  testFirstRound();
  testChallengerPoolRound();
  console.log('multisport-kotc-c6: all passed');
}

main();
