import { ALL_SPORTS, Sports, type Sport } from '@shared/sport';

function envFlag(key: string, defaultWhenUnset: boolean): boolean {
  const raw = import.meta.env[key];
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  if (raw === undefined || raw === '') return defaultWhenUnset;
  return defaultWhenUnset;
}

const defaultOn = import.meta.env.DEV;

export const multisportFlags = {
  sixSports: envFlag('VITE_MULTISPORT_6_SPORTS', defaultOn),
  tennis: envFlag('VITE_MULTISPORT_TENNIS', defaultOn),
  polish: envFlag('VITE_MULTISPORT_POLISH', defaultOn),
} as const;

export function isMultisport6SportsEnabled(): boolean {
  return multisportFlags.sixSports;
}

export function isMultisportTennisEnabled(): boolean {
  if (isMultisport6SportsEnabled()) return true;
  return multisportFlags.tennis;
}

export function isMultisportPolishEnabled(): boolean {
  return multisportFlags.polish;
}

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
