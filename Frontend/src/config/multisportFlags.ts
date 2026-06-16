import { ALL_SPORTS, type Sport } from '@shared/sport';

export function isSportCreatable(sport: Sport): boolean {
  return ALL_SPORTS.includes(sport);
}

export function getCreatableSports(): Sport[] {
  return ALL_SPORTS.filter(isSportCreatable);
}
