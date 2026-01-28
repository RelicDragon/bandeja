import { useState, useEffect, useMemo, useRef } from 'react';
import { citiesApi } from '@/api';
import { City } from '@/types';

function levenshtein(a: string, b: string): number {
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

function citySearchRelevancyScore(c: City, searchLower: string): number {
  const name = c.name.toLowerCase();
  if (name === searchLower) return 0;
  if (name.startsWith(searchLower)) return 1;
  if (name.includes(searchLower)) return 3;
  const maxLen = Math.max(name.length, searchLower.length);
  if (maxLen > 0 && levenshtein(name, searchLower) / maxLen <= 0.35) return 2;
  if (c.administrativeArea?.toLowerCase().includes(searchLower)) return 4;
  if (c.subAdministrativeArea?.toLowerCase().includes(searchLower)) return 5;
  return 6;
}

export type CityListView = 'country' | 'city';

export interface CountryWithClubs {
  country: string;
  cities: City[];
  clubsCount: number;
}

export interface UseCityListOptions {
  enabled: boolean;
  currentCityId?: string;
  onFetchError?: (setError: (msg: string) => void) => void;
}

export function useCityList({ enabled, currentCityId, onFetchError }: UseCityListOptions) {
  const onFetchErrorRef = useRef(onFetchError);
  onFetchErrorRef.current = onFetchError;

  const [cities, setCities] = useState<City[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<CityListView>('country');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const initialViewSetRef = useRef(false);

  const searchTrimmed = search.trim();
  const searchLower = searchTrimmed.length >= 2 ? searchTrimmed.toLowerCase() : '';

  const countriesWithClubs = useMemo(() => {
    const m = new Map<string, City[]>();
    for (const c of cities) {
      const list = m.get(c.country) ?? [];
      list.push(c);
      m.set(c.country, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return Array.from(m.entries())
      .map(([country, list]) => ({
        country,
        cities: list,
        clubsCount: list.reduce((s, c) => s + (c.clubsCount ?? 0), 0),
      }))
      .sort((a, b) => a.country.localeCompare(b.country));
  }, [cities]);

  const filteredCountries = useMemo(() => {
    if (!searchLower) return countriesWithClubs;
    return countriesWithClubs.filter((item) =>
      item.country.toLowerCase().includes(searchLower)
    );
  }, [countriesWithClubs, searchLower]);

  const currentCountryCities = useMemo(() => {
    if (!selectedCountry) return [];
    return countriesWithClubs.find((item) => item.country === selectedCountry)?.cities ?? [];
  }, [countriesWithClubs, selectedCountry]);

  const filteredCitiesForCountry = useMemo(() => {
    if (!searchLower) return currentCountryCities;
    return currentCountryCities
      .filter(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          (c.administrativeArea?.toLowerCase().includes(searchLower) ?? false) ||
          (c.subAdministrativeArea?.toLowerCase().includes(searchLower) ?? false) ||
          (Math.max(c.name.length, searchLower.length) > 0 &&
            levenshtein(c.name.toLowerCase(), searchLower) / Math.max(c.name.length, searchLower.length) <= 0.35)
      )
      .sort((a, b) => {
        const diff = citySearchRelevancyScore(a, searchLower) - citySearchRelevancyScore(b, searchLower);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
  }, [currentCountryCities, searchLower]);

  const selectCountry = (country: string) => {
    setSelectedCountry(country);
    setView('city');
  };

  const backToCountries = () => {
    setSelectedCountry(null);
    setView('country');
  };

  useEffect(() => {
    if (!enabled) {
      setSearch('');
      setLoading(true);
      setError('');
      setCities([]);
      initialViewSetRef.current = false;
      return;
    }
    setLoading(true);
    setError('');
    let cancelled = false;
    citiesApi
      .getAll()
      .then((res) => {
        if (cancelled) return;
        setCities(res.data);
        if (currentCityId && res.data.length) {
          const city = res.data.find((c) => c.id === currentCityId);
          if (city) {
            setView('city');
            setSelectedCountry(city.country);
            initialViewSetRef.current = true;
          }
        }
      })
      .catch(() => {
        if (!cancelled) onFetchErrorRef.current?.(setError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, currentCityId]);

  useEffect(() => {
    if (loading || initialViewSetRef.current || !currentCityId || cities.length === 0) return;
    const city = cities.find((c) => c.id === currentCityId);
    if (city) {
      setView('city');
      setSelectedCountry(city.country);
      initialViewSetRef.current = true;
    }
  }, [loading, currentCityId, cities]);

  return {
    cities,
    search,
    setSearch,
    loading,
    error,
    setError,
    view,
    selectedCountry,
    selectCountry,
    backToCountries,
    filteredCountries,
    filteredCitiesForCountry,
    countriesWithClubs,
  };
}
