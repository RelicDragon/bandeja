import { Sport } from '@prisma/client';
import {
  OPEN_ENDED_SCORING_PRESETS,
  TIMED_CUSTOM_CREATE_BY_SPORT,
  TIMED_CUSTOM_WEAK_LIVE_SPORTS,
  isOpenEndedScoringPreset,
  isWeakTimedCustomLive,
  registryAllowsOpenEndedPreset,
  supportsTimedOpenEndedRallyFreeze,
  timedCustomCreateAllowed,
} from '../../src/shared/timedCustomPresets';
import { getSportConfig } from '../../src/sport/sportRegistry';
import { validateGameForSport } from '../../src/utils/validators/validateGameForSport';
import { ApiError } from '../../src/utils/ApiError';
import {
  freezeTimedOpenEndedRallyAtPartialScore,
  scoreLivePoint,
} from '../../src/services/results/liveScoringEngine/core';
import { getRules } from '../../src/services/results/liveScoringEngine/rulebook';
import type { LiveScoringState } from '../../src/services/results/liveScoringEngine/types';

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

function testCreateAllowlistMatchesRegistry(): void {
  for (const sport of Object.values(Sport)) {
    const cfg = getSportConfig(sport);
    assert(
      registryAllowsOpenEndedPreset(cfg.allowedScoringPresets, sport),
      `registry ↔ TIMED_CUSTOM_CREATE_BY_SPORT for ${sport}`,
    );
  }
  console.log('ok: registry aligned with TIMED_CUSTOM_CREATE_BY_SPORT');
}

function testPickleballBlocksTimedOnCreate(): void {
  const cfg = getSportConfig(Sport.PICKLEBALL);
  assert(!cfg.allowedScoringPresets.includes('TIMED'), 'pickleball registry excludes TIMED');
  assert(cfg.allowedScoringPresets.includes('CUSTOM'), 'pickleball registry keeps CUSTOM');
  assert(!timedCustomCreateAllowed(Sport.PICKLEBALL, 'TIMED'), 'pickleball TIMED create blocked');
  assert(timedCustomCreateAllowed(Sport.PICKLEBALL, 'CUSTOM'), 'pickleball CUSTOM create allowed');
  assertThrows(
    () =>
      validateGameForSport({
        sport: 'PICKLEBALL',
        maxParticipants: 4,
        scoringPreset: 'TIMED',
      }),
    'validator rejects pickleball TIMED',
  );
  validateGameForSport({
    sport: 'PICKLEBALL',
    maxParticipants: 4,
    scoringPreset: 'CUSTOM',
  });
  console.log('ok: pickleball TIMED blocked, CUSTOM allowed');
}

function testPadelTennisTimedCustomAllowed(): void {
  for (const sport of [Sport.PADEL, Sport.TENNIS] as const) {
    for (const preset of OPEN_ENDED_SCORING_PRESETS) {
      assert(timedCustomCreateAllowed(sport, preset), `${sport} allows ${preset} on create`);
      validateGameForSport({ sport, maxParticipants: 4, scoringPreset: preset });
    }
  }
  console.log('ok: padel/tennis TIMED+CUSTOM validate');
}

function testRallySportsNoTimedCreate(): void {
  for (const sport of [Sport.BADMINTON, Sport.TABLE_TENNIS, Sport.SQUASH] as const) {
    const cfg = getSportConfig(sport);
    assert(!cfg.allowedScoringPresets.includes('TIMED'), `${sport} registry has no TIMED`);
    assertThrows(
      () => validateGameForSport({ sport, maxParticipants: 4, scoringPreset: 'TIMED' }),
      `${sport} validator rejects TIMED`,
    );
  }
  console.log('ok: rally sports reject TIMED on create');
}

function testWeakLiveFlag(): void {
  assert(isWeakTimedCustomLive(Sport.PICKLEBALL, 'CUSTOM'), 'pickleball CUSTOM is weak live');
  assert(!isWeakTimedCustomLive(Sport.PADEL, 'TIMED'), 'padel TIMED is not weak-live flagged');
  assert(!TIMED_CUSTOM_WEAK_LIVE_SPORTS.has(Sport.PADEL), 'only pickleball in weak-live set');
  console.log('ok: weak live flags');
}

function testOpenEndedRallyFreezeEngine(): void {
  assert(
    supportsTimedOpenEndedRallyFreeze('TIMED', 0),
    'TIMED with zero cap supports rally freeze',
  );
  assert(
    !supportsTimedOpenEndedRallyFreeze('POINTS_21', 21),
    'capped preset does not use open-ended freeze helper',
  );
  const rules = getRules({ scoringPreset: 'TIMED' }) as Parameters<
    typeof freezeTimedOpenEndedRallyAtPartialScore
  >[1];
  const state: LiveScoringState = {
    mode: 'points',
    sets: [{ teamA: 5, teamB: 3, isTieBreak: false }],
    activeSetIndex: 0,
  };
  const frozen = freezeTimedOpenEndedRallyAtPartialScore(state, rules);
  assert(frozen.changed && frozen.state.timedClassicSetLocked === true, 'freeze sets lock');
  const blocked = scoreLivePoint(frozen.state, 'teamA', rules);
  assert(!blocked.changed, 'scoring blocked while frozen');
  console.log('ok: open-ended rally freeze in live engine');
}

function testOpenEndedPresetGuard(): void {
  assert(isOpenEndedScoringPreset('TIMED'), 'TIMED is open-ended');
  assert(!isOpenEndedScoringPreset('POINTS_21'), 'POINTS_21 is not open-ended');
  console.log('ok: isOpenEndedScoringPreset');
}

function main(): void {
  testCreateAllowlistMatchesRegistry();
  testPickleballBlocksTimedOnCreate();
  testPadelTennisTimedCustomAllowed();
  testRallySportsNoTimedCreate();
  testWeakLiveFlag();
  testOpenEndedRallyFreezeEngine();
  testOpenEndedPresetGuard();
  console.log('multisport-post-wave2-timed: all passed');
}

main();
