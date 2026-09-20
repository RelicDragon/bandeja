/**
 * PRD 352 — chemistry math, with the zero-denominator cases spelled out.
 *
 * The rule the product depends on: a missing baseline is `null` ("nothing to
 * show"), never `0` ("they are exactly average"), and never an invented `0 %`
 * solo rate that would make every new partner look like a superstar.
 */

import {
  CHEMISTRY_POSITIVE_THRESHOLD,
  computeChemistry,
  isPositiveChemistry,
  roundPercentagePoints,
  winRatePercent,
} from './chemistry';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// winRatePercent
// ---------------------------------------------------------------------------

{
  assert(winRatePercent(5, 10) === 50, '5/10 is 50 %');
  assert(winRatePercent(0, 10) === 0, '0/10 is 0 %');
  assert(winRatePercent(10, 10) === 100, '10/10 is 100 %');
  assert(winRatePercent(3, 0) === null, 'a zero denominator has no win rate');
  assert(winRatePercent(1, -2) === null, 'a negative denominator has no win rate');
  assert(winRatePercent(12, 10) === 100, 'a corrupt counter clamps to 100 %');
  assert(winRatePercent(-1, 10) === 0, 'a negative numerator clamps to 0 %');
  assert(winRatePercent(1, Number.NaN) === null, 'NaN denominator has no win rate');
}

{
  assert(roundPercentagePoints(4.4) === 4, 'rounds down');
  assert(roundPercentagePoints(4.5) === 5, 'rounds half up');
  assert(roundPercentagePoints(-0.4) === 0, 'normalises -0 to 0');
  assert(Object.is(roundPercentagePoints(-0.4), 0), 'no negative zero leaks out');
}

// ---------------------------------------------------------------------------
// The happy path
// ---------------------------------------------------------------------------

{
  // Pair 72 %, solos 60 % and 50 % → baseline 55 % → +17.
  const result = computeChemistry({
    pair: { games: 18, wins: 13 },
    soloA: { games: 100, wins: 60 },
    soloB: { games: 100, wins: 50 },
  });
  assert(result.pairWinRate !== null && Math.round(result.pairWinRate) === 72, 'pair rate 72 %');
  assert(result.soloWinRate === 55, 'baseline is the mean of the two solo rates');
  assert(result.chemistry === 17, 'chemistry is the difference in whole points');
  assert(isPositiveChemistry(result.chemistry), 'a +17 pair is in sync');
}

{
  const worse = computeChemistry({
    pair: { games: 10, wins: 3 },
    soloA: { games: 50, wins: 30 },
    soloB: { games: 50, wins: 30 },
  });
  assert(worse.chemistry === -30, 'a pair worse than its members gets negative chemistry');
  assert(!isPositiveChemistry(worse.chemistry), 'negative chemistry is never green');
}

// ---------------------------------------------------------------------------
// Zero denominators
// ---------------------------------------------------------------------------

{
  const noPairGames = computeChemistry({
    pair: { games: 0, wins: 0 },
    soloA: { games: 10, wins: 5 },
    soloB: { games: 10, wins: 5 },
  });
  assert(noPairGames.pairWinRate === null, 'no games together means no pair win rate');
  assert(noPairGames.chemistry === null, 'no games together means no chemistry');
}

{
  const noSoloGames = computeChemistry({
    pair: { games: 6, wins: 6 },
    soloA: { games: 0, wins: 0 },
    soloB: { games: 0, wins: 0 },
  });
  assert(noSoloGames.pairWinRate === 100, 'the pair rate still exists');
  assert(noSoloGames.soloWinRate === null, 'two empty solo records have no baseline');
  assert(noSoloGames.chemistry === null, 'no baseline means no chemistry, not +100');
}

{
  // Exactly one empty solo record: the baseline is the *other* player alone.
  // Treating the unknown as 0 % would report +70 here instead of +40.
  const oneEmpty = computeChemistry({
    pair: { games: 10, wins: 7 },
    soloA: { games: 0, wins: 0 },
    soloB: { games: 20, wins: 6 },
  });
  assert(oneEmpty.soloWinRate === 30, 'baseline falls back to the one known solo rate');
  assert(oneEmpty.chemistry === 40, 'chemistry uses the single known baseline');
}

{
  const soloWinsOnly = computeChemistry({
    pair: { games: 5, wins: 0 },
    soloA: { games: 4, wins: 4 },
    soloB: { games: 4, wins: 0 },
  });
  assert(soloWinsOnly.pairWinRate === 0, 'a winless pair is 0 %, not null');
  assert(soloWinsOnly.soloWinRate === 50, 'baseline averages 100 % and 0 %');
  assert(soloWinsOnly.chemistry === -50, 'a winless pair of decent players reads -50');
}

{
  const corrupt = computeChemistry({
    pair: { games: 5, wins: 9 },
    soloA: { games: 10, wins: 30 },
    soloB: { games: 10, wins: 5 },
  });
  assert(corrupt.pairWinRate === 100, 'impossible pair counters clamp to 100 %');
  assert(corrupt.soloWinRate === 75, 'impossible solo counters clamp before averaging');
  assert(corrupt.chemistry === 25, 'clamped inputs still produce a finite number');
}

// ---------------------------------------------------------------------------
// Threshold
// ---------------------------------------------------------------------------

{
  assert(CHEMISTRY_POSITIVE_THRESHOLD === 5, 'the green threshold is +5 points');
  assert(!isPositiveChemistry(4), '+4 is neutral');
  assert(isPositiveChemistry(5), '+5 is the first green value');
  assert(!isPositiveChemistry(null), 'null chemistry is never green');
  assert(!isPositiveChemistry(undefined), 'missing chemistry is never green');
}

console.log('chemistry.test.ts OK');
