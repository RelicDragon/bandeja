/**
 * PRD 363 — when and how the "people looking to play" number is shown.
 *
 * The count is a hint, not a promise of a match, so it only appears when it
 * is clearly encouraging: three or more people, and only while the admin flag
 * is on. Below that the line is simply absent — there is no "nobody looking
 * yet" copy anywhere. Pure; the hook and both surfaces share it.
 */

export const LOOKING_COUNT_MIN_VISIBLE = 3;

/** Which discovery window the number covers (two keys after 18:00 city time). */
export type LookingCountWindow = 'today' | 'todayAndTomorrow';

export interface LookingCountDisplay {
  count: number;
  window: LookingCountWindow;
}

export function resolveLookingCountWindow(dayKeys: readonly string[] | null | undefined): LookingCountWindow {
  return (dayKeys?.length ?? 0) >= 2 ? 'todayAndTomorrow' : 'today';
}

export function resolveLookingCountDisplay(input: {
  /** Admin flag (`FIND_LOOKING_COUNT_ENABLED`). */
  enabled: boolean;
  /** `null` = flag off on the server; `undefined` = not loaded. */
  count: number | null | undefined;
  dayKeys?: readonly string[] | null;
}): LookingCountDisplay | null {
  if (!input.enabled) return null;
  if (typeof input.count !== 'number' || !Number.isFinite(input.count)) return null;
  if (input.count < LOOKING_COUNT_MIN_VISIBLE) return null;
  return { count: input.count, window: resolveLookingCountWindow(input.dayKeys) };
}
