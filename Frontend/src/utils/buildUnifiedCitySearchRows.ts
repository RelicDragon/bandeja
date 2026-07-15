import type { City } from '@/types';
import { getCitySearchNames, getCountrySearchNames } from '@/utils/geoTranslations';
import {
  cityMatchesListSearch,
  citySearchRelevancyScore,
  clubMatchesListSearch,
  clubSearchRelevancyScore,
  matchCountryForListSearch,
  type ClubListSearchItem,
} from '@/utils/citySearchHelpers';

export const MAX_UNIFIED_SEARCH_PER_KIND = 40;

export type CountrySearchGroup = {
  country: string;
  cities: City[];
  clubsCount: number;
};

export type UnifiedSearchRow =
  | { kind: 'section'; section: 'cities' | 'clubs' | 'countries' }
  | { kind: 'city'; city: City }
  | { kind: 'club'; club: ClubListSearchItem }
  | { kind: 'country'; group: CountrySearchGroup };

export type BuildUnifiedCitySearchRowsInput = {
  searchLower: string;
  cities: City[];
  clubs: ClubListSearchItem[];
  countries: CountrySearchGroup[];
  useGeo: boolean;
  maxPerKind?: number;
};

export function buildUnifiedCitySearchRows({
  searchLower,
  cities,
  clubs,
  countries,
  useGeo,
  maxPerKind = MAX_UNIFIED_SEARCH_PER_KIND,
}: BuildUnifiedCitySearchRowsInput): UnifiedSearchRow[] {
  if (!searchLower) return [];

  const matchedCities = cities
    .filter((c) => cityMatchesListSearch(c, searchLower, useGeo))
    .sort((a, b) => {
      const namesA = getCitySearchNames(a.id, a.name, a.country);
      const namesB = getCitySearchNames(b.id, b.name, b.country);
      const diff =
        citySearchRelevancyScore(a, searchLower, namesA) - citySearchRelevancyScore(b, searchLower, namesB);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    })
    .slice(0, maxPerKind);

  const matchedClubs = clubs
    .filter((club) => clubMatchesListSearch(club, searchLower, useGeo))
    .sort((a, b) => {
      const diff = clubSearchRelevancyScore(a, searchLower) - clubSearchRelevancyScore(b, searchLower);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    })
    .slice(0, maxPerKind);

  const matchedCountries = countries
    .filter((g) => matchCountryForListSearch(g.country, searchLower, useGeo))
    .sort((a, b) => {
      const namesA = getCountrySearchNames(a.country);
      const namesB = getCountrySearchNames(b.country);
      const score = (names: { en: string; es: string; ru: string; sr: string; native: string }, key: string) => {
        const values = [names.en, names.es, names.ru, names.sr, names.native, key]
          .filter(Boolean)
          .map((s) => s.toLowerCase());
        if (values.some((v) => v === searchLower)) return 0;
        if (values.some((v) => v.startsWith(searchLower))) return 1;
        return 2;
      };
      const diff = score(namesA, a.country) - score(namesB, b.country);
      return diff !== 0 ? diff : a.country.localeCompare(b.country);
    })
    .slice(0, maxPerKind);

  const kindsPresent =
    (matchedCities.length > 0 ? 1 : 0) + (matchedClubs.length > 0 ? 1 : 0) + (matchedCountries.length > 0 ? 1 : 0);
  const showSections = kindsPresent > 1;

  const rows: UnifiedSearchRow[] = [];
  if (matchedCities.length > 0) {
    if (showSections) rows.push({ kind: 'section', section: 'cities' });
    for (const city of matchedCities) rows.push({ kind: 'city', city });
  }
  if (matchedClubs.length > 0) {
    if (showSections) rows.push({ kind: 'section', section: 'clubs' });
    for (const club of matchedClubs) rows.push({ kind: 'club', club });
  }
  if (matchedCountries.length > 0) {
    if (showSections) rows.push({ kind: 'section', section: 'countries' });
    for (const group of matchedCountries) rows.push({ kind: 'country', group });
  }
  return rows;
}
