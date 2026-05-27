import { isSport, type Sport } from '@shared/sport';

export function parseLevelSportQuery(value: string | null | undefined): Sport | undefined {
  return isSport(value) ? value : undefined;
}

export function appendLevelSportQuery(path: string, sport: Sport | undefined): string {
  if (!sport) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}sport=${encodeURIComponent(sport)}`;
}
