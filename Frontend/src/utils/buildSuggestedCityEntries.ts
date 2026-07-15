import type { City } from '@/types';

export type SuggestedCityKind = 'nearest' | 'current' | 'both';

export interface SuggestedCityEntry {
  city: City;
  kind: SuggestedCityKind;
}

export function buildSuggestedCityEntries(options: {
  cities: City[];
  nearestCityId: string | null;
  currentCityId: string | null | undefined;
}): SuggestedCityEntry[] {
  const { cities, nearestCityId, currentCityId } = options;
  const nearest =
    nearestCityId != null ? (cities.find((c) => c.id === nearestCityId) ?? null) : null;
  const current =
    currentCityId != null && currentCityId !== ''
      ? (cities.find((c) => c.id === currentCityId) ?? null)
      : null;
  if (!nearest && !current) return [];
  if (nearest && current && nearest.id === current.id) {
    return [{ city: nearest, kind: 'both' }];
  }
  const entries: SuggestedCityEntry[] = [];
  if (nearest) entries.push({ city: nearest, kind: 'nearest' });
  if (current) entries.push({ city: current, kind: 'current' });
  return entries;
}
