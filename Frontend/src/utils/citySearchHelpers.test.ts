import { describe, expect, it, vi } from 'vitest';
import {
  CITY_LIST_SEARCH_MIN_LENGTH,
  cityMatchesListSearch,
  citySearchRelevancyScore,
  clubMatchesListSearch,
  clubSearchRelevancyScore,
  matchCountryForListSearch,
} from './citySearchHelpers';
import { buildUnifiedCitySearchRows } from './buildUnifiedCitySearchRows';
import type { City } from '@/types';

vi.mock('@/utils/geoTranslations', () => ({
  getCitySearchNames: (_id: string, name: string) => ({
    en: name,
    es: name,
    ru: name,
    sr: name,
    native: name,
  }),
  getCountrySearchNames: (key: string) => ({
    en: key,
    es: key,
    ru: key,
    sr: key,
    native: key,
  }),
}));

const city = (partial: Partial<City> & Pick<City, 'id' | 'name' | 'country'>): City =>
  ({
    clubsCount: 0,
    latitude: 0,
    longitude: 0,
    ...partial,
  }) as City;

describe('CITY_LIST_SEARCH_MIN_LENGTH', () => {
  it('is 2', () => {
    expect(CITY_LIST_SEARCH_MIN_LENGTH).toBe(2);
  });
});

describe('citySearchRelevancyScore', () => {
  const names = { en: 'Madrid', es: 'Madrid', ru: 'Мадрид', sr: 'Madrid', native: 'Madrid' };

  it('ranks exact ahead of prefix ahead of includes', () => {
    const c = city({ id: '1', name: 'Madrid', country: 'Spain' });
    expect(citySearchRelevancyScore(c, 'madrid', names)).toBe(0);
    expect(citySearchRelevancyScore(c, 'madr', names)).toBe(1);
    expect(citySearchRelevancyScore(c, 'dri', names)).toBe(3);
  });
});

describe('clubSearchRelevancyScore', () => {
  const club = {
    id: 'cl1',
    name: 'Padel House Madrid',
    cityId: '1',
    cityName: 'Madrid',
    country: 'Spain',
  };

  it('ranks name match ahead of city-only match', () => {
    expect(clubSearchRelevancyScore(club, 'padel house madrid')).toBe(0);
    expect(clubSearchRelevancyScore(club, 'padel')).toBe(1);
    expect(clubSearchRelevancyScore(club, 'madrid')).toBeLessThanOrEqual(4);
  });
});

describe('clubMatchesListSearch', () => {
  const club = {
    id: 'cl1',
    name: 'Arena Club',
    cityId: 'c1',
    cityName: 'Valencia',
    country: 'Spain',
  };

  it('matches club name and city', () => {
    expect(clubMatchesListSearch(club, 'arena', false)).toBe(true);
    expect(clubMatchesListSearch(club, 'valencia', false)).toBe(true);
    expect(clubMatchesListSearch(club, 'zzzz', false)).toBe(false);
  });

  it('does not flood clubs by country-only match', () => {
    expect(clubMatchesListSearch(club, 'spain', false)).toBe(false);
  });
});

describe('buildUnifiedCitySearchRows caps', () => {
  it('caps cities and clubs per kind', () => {
    const cities = Array.from({ length: 60 }, (_, i) =>
      city({ id: `c${i}`, name: `Madrid${i}`, country: 'Spain' })
    );
    const clubs = Array.from({ length: 60 }, (_, i) => ({
      id: `cl${i}`,
      name: `Madrid Club ${i}`,
      cityId: `c${i}`,
      cityName: `Madrid${i}`,
      country: 'Spain',
    }));
    const rows = buildUnifiedCitySearchRows({
      searchLower: 'madrid',
      cities,
      clubs,
      countries: [{ country: 'Spain', cities, clubsCount: 60 }],
      useGeo: false,
      maxPerKind: 40,
    });
    expect(rows.filter((r) => r.kind === 'city')).toHaveLength(40);
    expect(rows.filter((r) => r.kind === 'club')).toHaveLength(40);
  });
});

describe('matchCountryForListSearch', () => {
  it('matches country key without geo', () => {
    expect(matchCountryForListSearch('Spain', 'spa', false)).toBe(true);
    expect(matchCountryForListSearch('Spain', 'zzz', false)).toBe(false);
  });
});

describe('cityMatchesListSearch threshold helpers', () => {
  it('matches city name include', () => {
    const c = city({ id: '1', name: 'Belgrade', country: 'Serbia' });
    expect(cityMatchesListSearch(c, 'bel', false)).toBe(true);
    expect(cityMatchesListSearch(c, 'zzz', false)).toBe(false);
  });
});

describe('buildUnifiedCitySearchRows', () => {
  const madrid = city({ id: 'm1', name: 'Madrid', country: 'Spain', clubsCount: 3 });
  const malaga = city({ id: 'm2', name: 'Malaga', country: 'Spain', clubsCount: 1 });
  const clubs = [
    {
      id: 'cl1',
      name: 'Madrid Padel Club',
      cityId: 'm1',
      cityName: 'Madrid',
      country: 'Spain',
    },
    {
      id: 'cl2',
      name: 'Coast Club',
      cityId: 'm2',
      cityName: 'Malaga',
      country: 'Spain',
    },
  ];
  const countries = [
    { country: 'Spain', cities: [madrid, malaga], clubsCount: 4 },
    { country: 'Serbia', cities: [city({ id: 'b1', name: 'Belgrade', country: 'Serbia' })], clubsCount: 2 },
  ];

  it('returns empty for empty query', () => {
    expect(
      buildUnifiedCitySearchRows({
        searchLower: '',
        cities: [madrid],
        clubs,
        countries,
        useGeo: false,
      })
    ).toEqual([]);
  });

  it('country query returns country rows without flooding clubs', () => {
    const rows = buildUnifiedCitySearchRows({
      searchLower: 'spain',
      cities: [madrid, malaga],
      clubs,
      countries,
      useGeo: false,
    });
    expect(rows.some((r) => r.kind === 'country')).toBe(true);
    expect(rows.some((r) => r.kind === 'club')).toBe(false);
    expect(rows.every((r) => r.kind !== 'section')).toBe(true);
  });

  it('mixed city+club+country query shows section headers', () => {
    const rows = buildUnifiedCitySearchRows({
      searchLower: 'ser',
      cities: [city({ id: 'b1', name: 'Serajevo', country: 'Bosnia' }), city({ id: 'b2', name: 'Belgrade', country: 'Serbia' })],
      clubs: [
        {
          id: 'cl3',
          name: 'Serbia Padel Hub',
          cityId: 'b2',
          cityName: 'Belgrade',
          country: 'Serbia',
        },
      ],
      countries,
      useGeo: false,
    });
    const sections = rows.filter((r) => r.kind === 'section').map((r) => (r.kind === 'section' ? r.section : ''));
    expect(sections).toEqual(['cities', 'clubs', 'countries']);
  });

  it('puts cities section before clubs before countries', () => {
    const rows = buildUnifiedCitySearchRows({
      searchLower: 'ma',
      cities: [madrid, malaga],
      clubs,
      countries,
      useGeo: false,
    });
    const sectionOrder = rows.filter((r) => r.kind === 'section').map((r) => (r.kind === 'section' ? r.section : ''));
    expect(sectionOrder).toEqual(['cities', 'clubs']);
    const firstCityIdx = rows.findIndex((r) => r.kind === 'city');
    const firstClubIdx = rows.findIndex((r) => r.kind === 'club');
    expect(firstCityIdx).toBeGreaterThanOrEqual(0);
    expect(firstClubIdx).toBeGreaterThan(firstCityIdx);
  });

  it('club row exposes cityId for city selection', () => {
    const rows = buildUnifiedCitySearchRows({
      searchLower: 'madrid padel',
      cities: [madrid],
      clubs,
      countries,
      useGeo: false,
    });
    const clubRow = rows.find((r) => r.kind === 'club');
    expect(clubRow?.kind).toBe('club');
    if (clubRow?.kind === 'club') {
      expect(clubRow.club.cityId).toBe('m1');
    }
  });

  it('omits section headers when only one kind matches', () => {
    const rows = buildUnifiedCitySearchRows({
      searchLower: 'belgrade',
      cities: [city({ id: 'b1', name: 'Belgrade', country: 'Serbia' })],
      clubs: [],
      countries,
      useGeo: false,
    });
    expect(rows.every((r) => r.kind !== 'section')).toBe(true);
    expect(rows.some((r) => r.kind === 'city')).toBe(true);
  });
});
