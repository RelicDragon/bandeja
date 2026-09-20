/**
 * PRD 350 — pure tests for the onboarding routing projection, the step
 * vocabulary and the city-stats cache. No database, no network.
 */
import assert from 'node:assert/strict';
import {
  ONBOARDING_FIRST_STEP,
  ONBOARDING_STEPS,
  isOnboardingStep,
  onboardingStepIndex,
  parseOnboardingStep,
  resolveResumeStep,
} from './onboardingSteps';
import { projectOnboardingState } from './onboarding.service';
import { CityStatsCache } from './cityStats.service';

// ---------------------------------------------------------------------------
// step vocabulary
// ---------------------------------------------------------------------------

assert.deepEqual(
  [...ONBOARDING_STEPS],
  ['welcome', 'sport', 'profile', 'level', 'city', 'follow', 'notifications'],
  'step ids are persisted verbatim in User.onboardingStep — never reorder or rename',
);
assert.equal(ONBOARDING_FIRST_STEP, 'welcome');
assert.equal(onboardingStepIndex('city'), 4);

assert.equal(isOnboardingStep('sport'), true);
assert.equal(isOnboardingStep('SPORT'), false, 'ids are case-sensitive');
assert.equal(isOnboardingStep(''), false);
assert.equal(isOnboardingStep(null), false);

assert.equal(parseOnboardingStep('  level  '), 'level', 'stored values are trimmed');
assert.equal(parseOnboardingStep('retired-step'), null);
assert.equal(parseOnboardingStep(undefined), null);

// An unknown stored value restarts rather than dropping the user into a
// half-configured screen.
assert.equal(resolveResumeStep('follow'), 'follow');
assert.equal(resolveResumeStep('retired-step'), 'welcome');
assert.equal(resolveResumeStep(null), 'welcome');

// ---------------------------------------------------------------------------
// routing projection — the four user states the PRD names
// ---------------------------------------------------------------------------

// 1. brand-new account
const fresh = projectOnboardingState({
  onboardingCompletedAt: null,
  onboardingStep: null,
  sportsEnabled: [],
});
assert.equal(fresh.needsOnboarding, true);
assert.equal(fresh.needsSportStep, false, 'a user already going to /welcome is not "sport only"');
assert.equal(fresh.resumeStep, 'welcome');
assert.equal(fresh.step, null);
assert.equal(fresh.completedAt, null);

// 2. resumed mid-flow
const resumed = projectOnboardingState({
  onboardingCompletedAt: null,
  onboardingStep: 'city',
  sportsEnabled: ['PADEL'],
});
assert.equal(resumed.needsOnboarding, true);
assert.equal(resumed.resumeStep, 'city');
assert.equal(resumed.step, 'city');

// 3. completed — never sees the flow again
const completedAt = new Date('2026-01-02T03:04:05.000Z');
const done = projectOnboardingState({
  onboardingCompletedAt: completedAt,
  onboardingStep: null,
  sportsEnabled: ['PADEL', 'TENNIS'],
});
assert.equal(done.needsOnboarding, false);
assert.equal(done.needsSportStep, false);
assert.equal(done.completedAt, completedAt.toISOString());

// 4. completed but no enabled sport => /welcome?step=sport only
const sportless = projectOnboardingState({
  onboardingCompletedAt: completedAt,
  onboardingStep: null,
  sportsEnabled: [],
});
assert.equal(sportless.needsOnboarding, false);
assert.equal(sportless.needsSportStep, true);

// A non-array `sportsEnabled` (legacy null column) must not crash the router.
const nullSports = projectOnboardingState({
  onboardingCompletedAt: completedAt,
  onboardingStep: null,
  sportsEnabled: null,
});
assert.equal(nullSports.needsSportStep, true);

// ---------------------------------------------------------------------------
// city-stats cache
// ---------------------------------------------------------------------------

let clock = 0;
const cache = new CityStatsCache(1_000, () => clock, 3);

assert.equal(cache.get('belgrade'), undefined, 'cold miss');
cache.set('belgrade', { cityId: 'belgrade', playerCount: 2400 });
assert.deepEqual(cache.get('belgrade'), { cityId: 'belgrade', playerCount: 2400 });

clock = 999;
assert.ok(cache.get('belgrade'), 'still fresh one tick before the TTL');
clock = 1_000;
assert.equal(cache.get('belgrade'), undefined, 'expired entries are evicted on read');
assert.equal(cache.size, 0);

// Bounded: a client walking every city id cannot grow the map without limit.
clock = 0;
for (const id of ['a', 'b', 'c', 'd']) {
  cache.set(id, { cityId: id, playerCount: 1 });
}
assert.equal(cache.size, 3);
assert.equal(cache.get('a'), undefined, 'oldest key was evicted');
assert.ok(cache.get('d'));

cache.clear();
assert.equal(cache.size, 0);

console.log('onboarding.service.test.ts OK');
