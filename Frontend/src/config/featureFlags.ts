/**
 * Frontend feature flags for PRD 345–357 (CONTRACT §7.7).
 *
 * Opt-out style: a flag is on unless its `VITE_*` var is explicitly `0`,
 * `false` or `off`. The raw value is an injectable parameter so the readers are
 * testable without touching `import.meta.env` (same shape as
 * `features/player-level-feedback/player-level-feedback.ts`).
 *
 * A disabled feature must render nothing and issue no request — never a broken
 * or empty shell.
 */

const DISABLED_VALUES = ['0', 'false', 'off'];

function isEnabled(rawValue: unknown): boolean {
  if (typeof rawValue !== 'string') return true;
  return !DISABLED_VALUES.includes(rawValue.trim().toLowerCase());
}

/** PRD 345 — recurring game series. */
export function isGameSeriesEnabled(
  rawValue: unknown = import.meta.env.VITE_GAME_SERIES_ENABLED,
): boolean {
  return isEnabled(rawValue);
}

/** PRD 348 — cost split tracker. */
export function isCostSplitEnabled(
  rawValue: unknown = import.meta.env.VITE_COST_SPLIT_ENABLED,
): boolean {
  return isEnabled(rawValue);
}

/** PRD 355 — cosmetics shop. */
export function isShopEnabled(rawValue: unknown = import.meta.env.VITE_SHOP_ENABLED): boolean {
  return isEnabled(rawValue);
}
