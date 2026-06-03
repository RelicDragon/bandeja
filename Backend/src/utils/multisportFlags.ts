import { ALL_SPORTS, Sports, type Sport } from '../sport/sportIds';

function envEnabled(raw: string | undefined, defaultOn: boolean): boolean {
  if (raw === undefined || raw === '') return defaultOn;
  const v = raw.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  return v === 'true' || v === '1' || v === 'yes';
}

/** Milestone P3 — all six sports creatable (default on when unset, like questionnaire engine). */
export function isMultisport6SportsEnabled(): boolean {
  return envEnabled(process.env.MULTISPORT_6_SPORTS, true);
}

/** Milestone P1 — tennis creatable; implied when six-sport milestone is on. */
export function isMultisportTennisEnabled(): boolean {
  if (isMultisport6SportsEnabled()) return true;
  return envEnabled(process.env.MULTISPORT_TENNIS, true);
}

/** Milestone P4 — profile/clubs/notifications + casual create flow (D1/C0). */
export function isMultisportPolishEnabled(): boolean {
  return envEnabled(process.env.MULTISPORT_POLISH, true);
}

/** Social / Match / Advanced intent picker at create (requires polish milestone). */
export function isCasualCreateFlowGloballyEnabled(): boolean {
  return isMultisportPolishEnabled();
}

export function isSportCreatable(sport: Sport): boolean {
  if (sport === Sports.PADEL) return true;
  if (sport === Sports.TENNIS) return isMultisportTennisEnabled();
  return isMultisport6SportsEnabled();
}

export function getCreatableSports(): Sport[] {
  return ALL_SPORTS.filter(isSportCreatable);
}
