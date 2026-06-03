import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import { CREATE_TEMPLATES } from '../../src/sport/sportRegistryCasual';
import { getStrictValidationForPreset } from '../../src/shared/sportPresetMeta';
import { validateBwfRallyGameScore } from '../../src/shared/strictValidation';
import {
  supportsMatchTimerPointsRallyFreeze,
  supportsTimedOpenEndedRallyFreeze,
} from '../../src/shared/timedCustomPresets';
import { getRules, getRulesFromPreset } from '../../src/services/results/liveScoringEngine/rulebook';
import { validateGameForSport } from '../../src/utils/validators/validateGameForSport';
import { generateRandomRound } from '../../src/services/results/generation/random';
import { projectUserForSportContext } from '../../src/services/user/userSportProfile.service';
import {
  freezeTimedOpenEndedRallyAtPartialScore,
  freezeTimedSetAtPartialScore,
  scoreLivePoint,
} from '../../src/services/results/liveScoringEngine/core';
import type { LiveScoringState } from '../../src/services/results/liveScoringEngine/types';
import type { GenGame as Game } from '../../src/services/results/generation/types';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function mkUser(id: string, level = 3) {
  return { id, level, gender: 'MALE' as const };
}

function mkGame(sport: Sport, playersPerMatch: 2 | 4, count: number): Game {
  const participants = Array.from({ length: count }, (_, i) => ({
    userId: `u${i}`,
    status: 'PLAYING' as const,
    user: mkUser(`u${i}`, 3 + (i % 3) * 0.3),
  }));
  return {
    id: 'g1',
    sport,
    playersPerMatch,
    maxParticipants: count,
    participants,
    genderTeams: 'ANY',
    hasFixedTeams: false,
    gameCourts: [{ courtId: 'c1', order: 0 }],
    winnerOfGame: 'BY_SCORES_DELTA',
  } as Game;
}

/** G-PRESET: new presets validate on create path + rulebook smoke */
function testGPreset(): void {
  const presets = [
    'BEST_OF_3_15',
    'BEST_OF_3_11',
    'BEST_OF_5_11',
    'BEST_OF_3_21',
    'CLASSIC_FAST4',
    'POINTS_15',
  ] as const;

  for (const preset of presets) {
    const rules = getRulesFromPreset(preset);
    assert(rules.winnerOfMatch === 'BY_SETS' || rules.winnerOfMatch === 'BY_SCORES', `${preset} rulebook`);
  }

  validateGameForSport({
    sport: 'BADMINTON',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    scoringPreset: 'BEST_OF_3_15',
  });
  validateGameForSport({
    sport: 'PICKLEBALL',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    scoringPreset: 'BEST_OF_3_11',
  });
  validateGameForSport({
    sport: 'TENNIS',
    gameType: 'CLASSIC',
    matchGenerationType: 'AUTOMATIC',
    playersPerMatch: 2,
    scoringPreset: 'CLASSIC_FAST4',
  });

  const registryPath = join(
    __dirname,
    '../../../Frontend/src/liveScoring/registry.ts',
  );
  const registrySrc = readFileSync(registryPath, 'utf8');
  assert(registrySrc.includes("'CLASSIC_FAST4'"), 'FE live registry includes CLASSIC_FAST4 for tennis');

  console.log('ok: G-PRESET');
}

/** G-ROTATION: pickleball Americano 4p + badminton 2p singles */
function testGRotation(): void {
  const pickleball = mkGame(Sport.PICKLEBALL, 4, 8);
  const pbMatches = generateRandomRound(pickleball, [], [{ teamA: 0, teamB: 0 }]);
  assert(pbMatches.length >= 1, 'pickleball 4p americano matches');
  for (const m of pbMatches) {
    assert(m.teamA.length === 2 && m.teamB.length === 2, 'pickleball doubles sides');
  }

  const badminton = mkGame(Sport.BADMINTON, 2, 6);
  const bdMatches = generateRandomRound(badminton, [], [{ teamA: 0, teamB: 0 }]);
  assert(bdMatches.length >= 1, 'badminton 2p americano matches');
  for (const m of bdMatches) {
    assert(m.teamA.length === 1 && m.teamB.length === 1, 'badminton singles sides');
  }

  console.log('ok: G-ROTATION');
}

/** G-CASUAL: social templates affectsRating false; match templates true */
function testGCasual(): void {
  for (const tmpl of Object.values(CREATE_TEMPLATES)) {
    if (tmpl.tier === 'social') {
      assert(tmpl.affectsRating === false, `${tmpl.id} social affectsRating false`);
    }
    if (tmpl.tier === 'match') {
      assert(tmpl.affectsRating === true, `${tmpl.id} match affectsRating true`);
    }
    if (tmpl.matchTimerEnabled) {
      assert(
        (tmpl.matchTimedCapMinutes ?? 0) >= 1,
        `${tmpl.id} timer template has per-match cap`,
      );
      assert(Boolean(tmpl.expectedDurationLabelKey), `${tmpl.id} has expected duration label`);
    }
  }
  console.log('ok: G-CASUAL');
}

/** C5: social timer templates + POINTS_* rally freeze at buzzer */
function testC5SocialTime(): void {
  assert(
    supportsMatchTimerPointsRallyFreeze(true, 'POINTS_24', 24),
    'POINTS_24 + matchTimer supports rally freeze',
  );
  assert(
    !supportsMatchTimerPointsRallyFreeze(false, 'POINTS_24', 24),
    'POINTS_24 without timer flag',
  );
  assert(
    supportsTimedOpenEndedRallyFreeze('TIMED', 0),
    'TIMED open-ended freeze',
  );

  const pointsRules = getRules({
    scoringPreset: 'POINTS_24',
    matchTimerEnabled: true,
  });
  const state: LiveScoringState = {
    mode: 'points',
    sets: [{ teamA: 12, teamB: 10, isTieBreak: false }],
    activeSetIndex: 0,
  };
  const frozen = freezeTimedSetAtPartialScore(state, pointsRules, 'POINTS_24', true);
  assert(frozen.changed && frozen.state.timedClassicSetLocked === true, 'POINTS_24 freeze at buzzer');
  const blocked = scoreLivePoint(frozen.state, 'teamA', pointsRules);
  assert(!blocked.changed, 'scoring blocked after POINTS freeze');

  const openRules = getRules({ scoringPreset: 'TIMED', matchTimerEnabled: true });
  const openState: LiveScoringState = {
    mode: 'points',
    sets: [{ teamA: 5, teamB: 3, isTieBreak: false }],
    activeSetIndex: 0,
  };
  const openFrozen = freezeTimedOpenEndedRallyAtPartialScore(openState, openRules);
  assert(openFrozen.changed, 'TIMED open-ended freeze unchanged');

  console.log('ok: C5 social time');
}

/** G-STRICT: BWF cap on BEST_OF_3_21; social POINTS_21 not capped */
function testGStrict(): void {
  assert(getStrictValidationForPreset('BADMINTON', 'BEST_OF_3_21') === 'BWF_21', 'BWF on Bo3 21');
  assert(getStrictValidationForPreset('BADMINTON', 'BEST_OF_3_15') === 'BWF_15', 'BWF on Bo3 15');
  assert(getStrictValidationForPreset('BADMINTON', 'POINTS_21') === 'NONE', 'no BWF on POINTS_21');

  assert(validateBwfRallyGameScore(30, 29, 21).ok === true, 'BWF allows 30-29');
  assert(validateBwfRallyGameScore(21, 20, 21).ok === false, 'BWF rejects 21-20');
  assert(validateBwfRallyGameScore(12, 9, 21).ok === false, 'BWF rejects under-21 winner');

  console.log('ok: G-STRICT');
}

/** G-RATING avatar projection: padel 3.0 vs tennis 5.0 same user */
function testGRatingProjection(): void {
  const user = {
    id: 'u1',
    level: 3.0,
    reliability: 40,
    gamesPlayed: 5,
    gamesWon: 2,
    sportProfiles: [
      { sport: Sport.PADEL, level: 3.0, reliability: 50, gamesPlayed: 5, gamesWon: 2 },
      { sport: Sport.TENNIS, level: 5.0, reliability: 60, gamesPlayed: 8, gamesWon: 4 },
    ],
  };
  const padel = projectUserForSportContext(user, Sport.PADEL) as { level: number };
  const tennis = projectUserForSportContext(user, Sport.TENNIS) as { level: number };
  assert(padel.level === 3.0, 'projected padel level 3.0');
  assert(tennis.level === 5.0, 'projected tennis level 5.0');
  console.log('ok: G-RATING projection');
}

/** G-PADEL-REG: padel Americano path unchanged after multisport presets */
function testGPadelReg(): void {
  validateGameForSport({
    sport: 'PADEL',
    gameType: 'AMERICANO',
    matchGenerationType: 'RANDOM',
    playersPerMatch: 4,
    scoringPreset: 'POINTS_24',
  });
  const tpl = CREATE_TEMPLATES.PADEL_AMERICANO_24;
  assert(tpl.scoringPreset === 'POINTS_24' && tpl.affectsRating === false, 'padel americano template');
  console.log('ok: G-PADEL-REG');
}

function main(): void {
  testGPreset();
  testGRotation();
  testGCasual();
  testC5SocialTime();
  testGStrict();
  testGRatingProjection();
  testGPadelReg();
  console.log('multisport-gates: all passed');
}

main();
