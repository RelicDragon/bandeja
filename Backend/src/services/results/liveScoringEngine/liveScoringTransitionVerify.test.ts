/**
 * Live PATCH transition graph: buzzer freezes on points rows must be reachable neighbors.
 * Run: `cd Backend && ../scripts/run-heavy ts-node --transpile-only src/services/results/liveScoringEngine/liveScoringTransitionVerify.test.ts`
 */
import {
  clearTimedClassicSetLock,
  createInitialLiveScoringState,
  freezeTimedClassicSetAtPartialScore,
  freezeTimedSetAtPartialScore,
  scoreLivePoint,
} from './core';
import { isLiveScoringTransitionWithinSteps } from './liveScoringTransitionVerify';
import { getRules } from './rulebook';
import type { LiveScoringState } from './types';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function pointsState(teamA: number, teamB: number): LiveScoringState {
  return { mode: 'points', sets: [{ teamA, teamB, isTieBreak: false }], activeSetIndex: 0 };
}

// POINTS_* + match timer: rally freeze at the buzzer is one step away.
{
  const rules = getRules({ sport: 'PADEL', scoringPreset: 'POINTS_24', matchTimerEnabled: true });
  const prev = pointsState(12, 10);
  const frozen = freezeTimedSetAtPartialScore(prev, rules, 'POINTS_24', true);
  assert(frozen.changed && frozen.state.timedClassicSetLocked === true, 'POINTS_24 freeze changes state');
  assert(
    isLiveScoringTransitionWithinSteps(prev, frozen.state, rules, prev.sets, 1),
    'POINTS_24 buzzer freeze is a transition-graph neighbor'
  );
  const unfrozen = clearTimedClassicSetLock(frozen.state);
  assert(
    isLiveScoringTransitionWithinSteps(frozen.state, unfrozen.state, rules, prev.sets, 1),
    'POINTS_24 unlock is a transition-graph neighbor'
  );
}

// POINTS_* without the match timer: no rally freeze neighbor (matches client gating).
{
  const rules = getRules({ sport: 'PADEL', scoringPreset: 'POINTS_24', matchTimerEnabled: false });
  const prev = pointsState(12, 10);
  const forced: LiveScoringState = { ...prev, timedClassicSetLocked: true };
  assert(
    !isLiveScoringTransitionWithinSteps(prev, forced, rules, prev.sets, 1),
    'POINTS_24 without timer cannot freeze via the graph'
  );
}

// Open-ended TIMED: freeze at partial score is a neighbor (freeze only, no timer flag needed).
{
  const rules = getRules({ sport: 'PADEL', scoringPreset: 'TIMED', matchTimerEnabled: true });
  const prev = pointsState(5, 3);
  const frozen = freezeTimedSetAtPartialScore(prev, rules, 'TIMED', true);
  assert(frozen.changed, 'TIMED open-ended freeze changes state');
  assert(
    isLiveScoringTransitionWithinSteps(prev, frozen.state, rules, prev.sets, 1),
    'TIMED open-ended freeze is a transition-graph neighbor'
  );
  const scoredAfterFreeze = scoreLivePoint(frozen.state, 'teamA', rules);
  assert(!scoredAfterFreeze.changed, 'scoring blocked after TIMED freeze');
}

// Zero-cap CUSTOM behaves like TIMED for the open-ended freeze.
{
  const rules = getRules({ sport: 'PADEL', scoringPreset: 'CUSTOM' });
  const prev = pointsState(4, 4);
  const frozen = freezeTimedSetAtPartialScore(prev, rules, 'CUSTOM', false);
  assert(frozen.changed, 'CUSTOM open-ended freeze changes state');
  assert(
    isLiveScoringTransitionWithinSteps(prev, frozen.state, rules, prev.sets, 1),
    'CUSTOM open-ended freeze is a transition-graph neighbor'
  );
}

// Empty points row cannot be frozen (no partial score) — and the graph agrees.
{
  const rules = getRules({ sport: 'PADEL', scoringPreset: 'TIMED', matchTimerEnabled: true });
  const prev = pointsState(0, 0);
  const forced: LiveScoringState = { ...prev, timedClassicSetLocked: true };
  assert(
    !isLiveScoringTransitionWithinSteps(prev, forced, rules, prev.sets, 1),
    'TIMED 0-0 freeze is not reachable'
  );
}

// Classic timed freeze still a neighbor (regression guard for the existing edge).
{
  const rules = getRules({ sport: 'TENNIS', scoringPreset: 'CLASSIC_TIMED', matchTimerEnabled: true });
  let prev = createInitialLiveScoringState(rules);
  prev = scoreLivePoint(prev, 'teamA', rules).state;
  const frozen = freezeTimedClassicSetAtPartialScore(prev, rules);
  assert(frozen.changed, 'classic timed freeze changes state');
  assert(
    isLiveScoringTransitionWithinSteps(prev, frozen.state, rules, prev.sets, 1),
    'classic timed freeze is a transition-graph neighbor'
  );
}

console.log('liveScoringTransitionVerify: all passed');
