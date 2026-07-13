import {
  accrueRatingUncertainty,
  clampRatingUncertainty,
  computeReliabilityCoefficient,
  isRatingSettling,
  ratingUncertaintyAfterFinishedGame,
  ratingUncertaintyScale,
} from './ratingUncertainty';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const daysAfter = (t0: Date, days: number) =>
  new Date(t0.getTime() + days * 86_400_000);

assert(near(ratingUncertaintyScale(0), 1), 'scale 0');
assert(near(ratingUncertaintyScale(100), 2), 'scale 100');
assert(near(ratingUncertaintyScale(150), 3), 'scale 150');
assert(clampRatingUncertainty(200) === 150, 'clamp max');
assert(clampRatingUncertainty(-5) === 0, 'clamp min');

const t0 = new Date('2026-01-01T00:00:00.000Z');
assert(accrueRatingUncertainty(0, null, t0) === 0, 'null activity no accrue');
assert(accrueRatingUncertainty(0, t0, daysAfter(t0, 15)) === 0, 'grace 15d');
assert(accrueRatingUncertainty(0, t0, daysAfter(t0, 30)) === 0, 'grace exactly 30d');
assert(near(accrueRatingUncertainty(0, t0, daysAfter(t0, 45)), 5), '+5 at 15d post-grace');
assert(near(accrueRatingUncertainty(0, t0, daysAfter(t0, 60)), 10), '+10 at 30d post-grace');
assert(near(accrueRatingUncertainty(20, t0, daysAfter(t0, 60)), 30), 'base+10 at 60d');
assert(accrueRatingUncertainty(20, t0, daysAfter(t0, 20)) === 20, 'grace keeps stored base');
assert(accrueRatingUncertainty(140, t0, daysAfter(t0, 200)) === 150, 'cap 150');

assert(ratingUncertaintyAfterFinishedGame(30) === 20, 'play -10');
assert(ratingUncertaintyAfterFinishedGame(5) === 0, 'play floor 0');

assert(!isRatingSettling(29.9), 'settling below');
assert(isRatingSettling(30), 'settling at threshold');

const base = computeReliabilityCoefficient(50, 0);
const doubled = computeReliabilityCoefficient(50, 100);
assert(near(doubled, base * 2), 'U100 doubles coefficient');

console.log('ratingUncertainty: OK');
