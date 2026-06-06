import { CREATE_TEMPLATES } from '../../src/shared/createTemplates';
import { getSportConfig } from '../../src/sport/sportRegistry';
import { getStrictValidationForPreset } from '../../src/shared/sportPresetMeta';
import { getRules } from '../../src/services/results/liveScoringEngine/rulebook';
import { generateSwissPairingRound } from '../../src/services/results/generation/swissPairing';
import { generateEscaleraRound } from '../../src/services/results/generation/escalera';
import { generateKingOfTheCourtRound } from '../../src/services/results/generation/kingOfTheCourt';
import { validateGameForSport } from '../../src/utils/validators/validateGameForSport';
import type { GenGame } from '../../src/services/results/generation/types';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function testStrictCaps(): void {
  assert(getStrictValidationForPreset('BADMINTON', 'BEST_OF_3_21') === 'BWF_21', 'BWF_21 on Bo3×21');
  assert(getStrictValidationForPreset('BADMINTON', 'BEST_OF_3_15') === 'BWF_15', 'BWF_15 on Bo3×15');
  assert(getStrictValidationForPreset('BADMINTON', 'POINTS_21') === 'NONE', 'no cap on ball budget');
  assert(getStrictValidationForPreset('PICKLEBALL', 'BEST_OF_3_11') === 'PICKLEBALL_RALLY_11', 'pickleball match');
  assert(getStrictValidationForPreset('PICKLEBALL', 'POINTS_21') === 'NONE', 'pickleball social cap');
  console.log('ok: tier-bc strict caps');
}

function testFast4Defaults(): void {
  const rules = getRules({
    sport: 'TENNIS',
    scoringPreset: 'CLASSIC_FAST4',
    ballsInGames: true,
    winnerOfMatch: 'BY_SETS',
    fixedNumberOfSets: 3,
  });
  assert(rules.hasGoldenPoint === true, 'FAST4 defaults no-ad (golden point)');
  assert(rules.gamesPerSet === 4 && rules.tieBreakGameFirstTo === 5, 'FAST4 set + TB shape');
  const tpl = CREATE_TEMPLATES.TENNIS_FAST4_SOCIAL;
  assert(tpl.hasGoldenPoint === true, 'FAST4 template sets golden point');
  console.log('ok: tier-bc FAST4');
}

function testTimedAmericanoTemplates(): void {
  const t10 = CREATE_TEMPLATES.PADEL_AMERICANO_10;
  const t24 = CREATE_TEMPLATES.PADEL_AMERICANO_24;
  const t20 = CREATE_TEMPLATES.PADEL_AMERICANO_20;
  assert(t10.matchTimedCapMinutes === 10, 'Americano 10 min');
  assert(t24.matchTimedCapMinutes === 15, 'Americano 15 min');
  assert(t20.matchTimedCapMinutes === 20, 'Americano 20 min');
  assert(t10.matchGenerationType === 'RANDOM' && t10.scoringPreset === 'POINTS_24', 'timed americano gen');
  const padelTemplates = getSportConfig('PADEL').createTemplates;
  assert(padelTemplates.includes('PADEL_AMERICANO_10'), 'registry lists 10 min template');
  assert(padelTemplates.includes('PADEL_AMERICANO_20'), 'registry lists 20 min template');
  console.log('ok: tier-bc timed Americano templates');
}

function testChallengerAndSwiss(): void {
  const pool = CREATE_TEMPLATES.PADEL_CHALLENGER_POOL;
  assert(pool.matchGenerationType === 'KING_OF_COURT' && pool.gameType === 'KOTC', 'challenger pool → KOTC');
  validateGameForSport({
    sport: 'PADEL',
    gameType: 'KOTC',
    matchGenerationType: 'KING_OF_COURT',
    playersPerMatch: 4,
    scoringPreset: 'POINTS_11',
  });

  const box = CREATE_TEMPLATES.TT_BOX_BO3_11;
  assert(box.matchGenerationType === 'ESCALERA' && box.gameType === 'LADDER', 'TT box uses ESCALERA');
  const rr = CREATE_TEMPLATES.TT_CLUB_RR_11;
  assert(rr.matchGenerationType === 'ROUND_ROBIN' && rr.gameType === 'ROUND_ROBIN', 'TT club RR');
  assert(generateSwissPairingRound === generateEscaleraRound, 'Swiss stub aliases escalera');

  const game = {
    id: 'g-kotc',
    sport: 'PADEL',
    playersPerMatch: 4,
    maxParticipants: 8,
    participants: Array.from({ length: 8 }, (_, i) => ({
      userId: `u${i}`,
      status: 'PLAYING' as const,
      user: { id: `u${i}`, level: 3, gender: 'MALE' as const },
    })),
    genderTeams: 'ANY',
    hasFixedTeams: false,
    gameCourts: [
      { courtId: 'c1', order: 0 },
      { courtId: 'c2', order: 1 },
    ],
    winnerOfGame: 'BY_SCORES_DELTA',
    matchGenerationType: 'KING_OF_COURT',
  } as GenGame;
  const initialSets = [{ teamA: 0, teamB: 0, isTieBreak: false }];
  const m = generateKingOfTheCourtRound(game, [], initialSets);
  assert(m.length >= 1, 'KOTC generation hook produces matches');
  console.log('ok: tier-bc challenger pool + Swiss stub');
}

function testEngagementTemplates(): void {
  assert(CREATE_TEMPLATES.BADMINTON_AMERICANO_21.scoringPreset === 'POINTS_21', 'badminton social');
  assert(CREATE_TEMPLATES.PICKLEBALL_KOTC_11.sport === 'PICKLEBALL', 'pickleball KOTC');
  assert(getSportConfig('BADMINTON').createTemplates.includes('BADMINTON_AMERICANO_21'), 'badminton template wired');
  console.log('ok: tier-bc engagement templates');
}

testStrictCaps();
testFast4Defaults();
testTimedAmericanoTemplates();
testChallengerAndSwiss();
testEngagementTemplates();
console.log('ok: multisport-formats-tier-bc.ts');
