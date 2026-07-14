/**
 * Canonical displayable-next-game policy for widgets, `/next-game`, and Assistant.
 * Keep JS `pickNextGame`, Swift `NextGamePicker`, and Kotlin `NextGamePicker` aligned.
 * Parity catalog: `pickNextGameGolden.json` (#273 / epic #272).
 */
export const NEXT_GAME_DISPLAY_POLICY =
  'Soonest non-FINISHED/ARCHIVED game with startTime strictly after reference−1h; earliest startTime wins.';

/** Seconds / ms cut from reference to form the eligibility floor. */
export const NEXT_GAME_LOOKBACK_SECONDS = 3600;
export const NEXT_GAME_LOOKBACK_MS = NEXT_GAME_LOOKBACK_SECONDS * 1000;
