import type { Sport } from '@shared/sport';

/**
 * PRD 350 step 2 — the sport grid's selection rules, isolated from the view so
 * they can be tested without a DOM.
 *
 * Rules:
 *   · multi-select;
 *   · the **first** tap sets the primary;
 *   · deselecting the primary hands the tag to whatever is still selected;
 *   · Continue unlocks at one selection.
 */
export interface SportSelection {
  selected: Sport[];
  primary: Sport | null;
}

export function toggleSport(state: SportSelection, sport: Sport): SportSelection {
  const isOn = state.selected.includes(sport);
  const selected = isOn
    ? state.selected.filter((entry) => entry !== sport)
    : [...state.selected, sport];

  let primary = state.primary;
  if (!isOn && primary === null) primary = sport;
  if (isOn && primary === sport) primary = selected[0] ?? null;
  if (primary !== null && !selected.includes(primary)) primary = selected[0] ?? null;

  return { selected, primary };
}

/** Long-press, or the accessible "Make primary" action. Selects if needed. */
export function makeSportPrimary(state: SportSelection, sport: Sport): SportSelection {
  return {
    selected: state.selected.includes(sport) ? state.selected : [...state.selected, sport],
    primary: sport,
  };
}

export function canContinueFromSportStep(state: SportSelection): boolean {
  return state.selected.length > 0;
}

/** What the step actually submits: never `null` once Continue is enabled. */
export function resolveSubmittedPrimary(state: SportSelection): Sport | null {
  if (state.selected.length === 0) return null;
  return state.primary && state.selected.includes(state.primary)
    ? state.primary
    : state.selected[0];
}
