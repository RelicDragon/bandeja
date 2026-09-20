/**
 * PRD 352 — "chemistry": how much better a pair does together than its two members do
 * on their own, in win-rate percentage points.
 *
 *     chemistry = pairWinRate − mean(soloWinRate A, soloWinRate B)
 *
 * Pure, no Prisma. The solo numbers come from `UserSportProfile.gamesPlayed` /
 * `gamesWon` for the whole-time window, and from the windowed scan for `period=10|30`.
 *
 * Zero denominators — the part that is easy to get wrong:
 *
 * | Case | Result | Why |
 * |---|---|---|
 * | `pairGames === 0` | `chemistry = null` | there is no pair win rate to compare |
 * | both solo denominators `0` | `chemistry = null` | no baseline exists; a chip would be fiction |
 * | exactly one solo denominator `0` | baseline is the *other* player's rate alone | treating an unknown as `0 %` would invent a huge positive chemistry for a brand-new partner |
 * | `soloWins > soloGames` (impossible data) | clamped to `100 %` | a corrupt counter must not produce a >100 % rate |
 *
 * `null` is the "no chemistry to show" state and renders nothing — never a `0`.
 */

/** A pair is "in sync" when it beats the solo average by at least this many points. */
export const CHEMISTRY_POSITIVE_THRESHOLD = 5;

export interface WinRateCounts {
  games: number;
  wins: number;
}

export interface ChemistryInput {
  pair: WinRateCounts;
  soloA: WinRateCounts;
  soloB: WinRateCounts;
}

export interface ChemistryResult {
  /** Win rate of the pair, 0–100, or `null` when they have no games together. */
  pairWinRate: number | null;
  /** Mean solo win rate of the members that have any games, or `null`. */
  soloWinRate: number | null;
  /** `pairWinRate − soloWinRate`, rounded to whole points, or `null`. */
  chemistry: number | null;
}

function isCountable(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Win rate as a 0–100 percentage, or `null` when the denominator is zero, negative or
 * not finite. Never throws, never returns `NaN`.
 */
export function winRatePercent(wins: number, games: number): number | null {
  if (!isCountable(games)) return null;
  if (!Number.isFinite(wins) || wins <= 0) return 0;
  const raw = (wins / games) * 100;
  if (raw >= 100) return 100;
  return raw;
}

/** Round a percentage to whole points, with `-0` normalised to `0`. */
export function roundPercentagePoints(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

export function computeChemistry(input: ChemistryInput): ChemistryResult {
  const pairWinRate = winRatePercent(input.pair.wins, input.pair.games);

  const soloRates: number[] = [];
  const rateA = winRatePercent(input.soloA.wins, input.soloA.games);
  const rateB = winRatePercent(input.soloB.wins, input.soloB.games);
  if (rateA !== null) soloRates.push(rateA);
  if (rateB !== null) soloRates.push(rateB);

  const soloWinRate =
    soloRates.length > 0
      ? soloRates.reduce((sum, rate) => sum + rate, 0) / soloRates.length
      : null;

  if (pairWinRate === null || soloWinRate === null) {
    return { pairWinRate, soloWinRate, chemistry: null };
  }

  return {
    pairWinRate,
    soloWinRate,
    chemistry: roundPercentagePoints(pairWinRate - soloWinRate),
  };
}

/** Drives the chip's green vs. neutral tone. `null` chemistry is never positive. */
export function isPositiveChemistry(chemistry: number | null | undefined): boolean {
  return typeof chemistry === 'number' && chemistry >= CHEMISTRY_POSITIVE_THRESHOLD;
}
