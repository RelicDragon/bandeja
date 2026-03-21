import type { City } from '@/types';
import { getCountrySearchNames, getCitySearchNames } from '@/utils/geoTranslations';

export function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  let prevRow = Array.from({ length: bn + 1 }, (_, j) => j);
  for (let i = 1; i <= an; i++) {
    const currRow = [i];
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(prevRow[j - 1] + cost, prevRow[j] + 1, currRow[j - 1] + 1);
    }
    prevRow = currRow;
  }
  return prevRow[bn];
}

export function citySearchValues(searchNames: { en: string; es: string; ru: string; sr: string; native: string }): string[] {
  return [searchNames.en, searchNames.es, searchNames.ru, searchNames.sr, searchNames.native]
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

export function citySearchRelevancyScore(
  c: City,
  searchLower: string,
  searchNames: { en: string; es: string; ru: string; sr: string; native: string }
): number {
  const name = c.name.toLowerCase();
  const values = citySearchValues(searchNames);
  if (name === searchLower || values.some((v) => v === searchLower)) return 0;
  if (values.some((v) => v.startsWith(searchLower)) || name.startsWith(searchLower)) return 1;
  if (values.some((v) => v.includes(searchLower)) || name.includes(searchLower)) return 3;
  const maxLen = Math.max(name.length, searchLower.length);
  if (maxLen > 0 && levenshtein(name, searchLower) / maxLen <= 0.35) return 2;
  if (c.administrativeArea?.toLowerCase().includes(searchLower)) return 4;
  if (c.subAdministrativeArea?.toLowerCase().includes(searchLower)) return 5;
  return 6;
}

export function matchCountryForListSearch(countryKey: string, searchLower: string, useGeo: boolean): boolean {
  if (useGeo) {
    const names = getCountrySearchNames(countryKey);
    const values = [names.en, names.es, names.ru, names.sr, names.native]
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    if (values.some((v) => v.includes(searchLower))) return true;
  }
  return countryKey.toLowerCase().includes(searchLower);
}

export function cityMatchesListSearch(c: City, searchLower: string, useGeo: boolean): boolean {
  if (useGeo) {
    const names = getCitySearchNames(c.id, c.name, c.country);
    if (citySearchValues(names).some((v) => v.includes(searchLower))) return true;
  }
  if (c.name.toLowerCase().includes(searchLower)) return true;
  if (c.administrativeArea?.toLowerCase().includes(searchLower) ?? false) return true;
  if (c.subAdministrativeArea?.toLowerCase().includes(searchLower) ?? false) return true;
  const maxLen = Math.max(c.name.length, searchLower.length);
  return maxLen > 0 && levenshtein(c.name.toLowerCase(), searchLower) / maxLen <= 0.35;
}

export function clubMatchesListSearch(
  club: { name: string; cityName: string; country: string; cityId: string },
  searchLower: string,
  useGeo: boolean
): boolean {
  if (
    club.name.toLowerCase().includes(searchLower) ||
    club.cityName.toLowerCase().includes(searchLower) ||
    club.country.toLowerCase().includes(searchLower)
  ) {
    return true;
  }
  if (matchCountryForListSearch(club.country, searchLower, useGeo)) return true;
  if (useGeo) {
    const names = getCitySearchNames(club.cityId, club.cityName, club.country);
    if (citySearchValues(names).some((v) => v.includes(searchLower))) return true;
  }
  return false;
}
