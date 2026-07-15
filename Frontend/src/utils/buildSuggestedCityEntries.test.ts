import { describe, expect, it } from 'vitest';
import { buildSuggestedCityEntries } from './buildSuggestedCityEntries';
import type { City } from '@/types';

const city = (id: string, name: string): City =>
  ({
    id,
    name,
    country: 'ES',
    clubsCount: 1,
  }) as City;

describe('buildSuggestedCityEntries', () => {
  const cities = [city('a', 'Madrid'), city('b', 'Barcelona')];

  it('returns empty when neither nearest nor current', () => {
    expect(buildSuggestedCityEntries({ cities, nearestCityId: null, currentCityId: undefined })).toEqual(
      []
    );
  });

  it('returns nearest only', () => {
    expect(buildSuggestedCityEntries({ cities, nearestCityId: 'b', currentCityId: null })).toEqual([
      { city: cities[1], kind: 'nearest' },
    ]);
  });

  it('returns current only', () => {
    expect(buildSuggestedCityEntries({ cities, nearestCityId: null, currentCityId: 'a' })).toEqual([
      { city: cities[0], kind: 'current' },
    ]);
  });

  it('merges when nearest equals current', () => {
    expect(buildSuggestedCityEntries({ cities, nearestCityId: 'a', currentCityId: 'a' })).toEqual([
      { city: cities[0], kind: 'both' },
    ]);
  });

  it('lists nearest then current when different', () => {
    expect(buildSuggestedCityEntries({ cities, nearestCityId: 'b', currentCityId: 'a' })).toEqual([
      { city: cities[1], kind: 'nearest' },
      { city: cities[0], kind: 'current' },
    ]);
  });
});
