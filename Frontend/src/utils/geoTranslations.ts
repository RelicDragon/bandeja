export type GeoLocale = 'en' | 'es' | 'ru' | 'sr';

interface CountryTranslation {
  en: string;
  es: string;
  ru: string;
  sr: string;
  native: string;
  iso2: string;
}

interface CityTranslation {
  en: string;
  es: string;
  ru: string;
  sr: string;
  native: string;
  countryKey: string;
}

let countriesData: Record<string, CountryTranslation> | null = null;
let citiesData: Record<string, CityTranslation> | null = null;
let loadPromise: Promise<void> | null = null;

async function loadGeoData(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const [countriesRes, citiesRes] = await Promise.all([
        fetch('/geo/countries.json'),
        fetch('/geo/cities.json'),
      ]);
      if (countriesRes.ok) countriesData = await countriesRes.json();
      if (citiesRes.ok) citiesData = await citiesRes.json();
    } catch {
      countriesData = {};
      citiesData = {};
    }
  })();
  return loadPromise;
}

export function getGeoDataLoaded(): boolean {
  return countriesData !== null && citiesData !== null;
}

export function ensureGeoDataLoaded(): Promise<void> {
  return loadGeoData();
}

function toGeoLocale(locale: string): GeoLocale {
  const code = locale.split('-')[0].toLowerCase();
  if (code === 'en' || code === 'es' || code === 'ru' || code === 'sr') return code;
  return 'en';
}

export function getCountryDisplayName(countryKey: string, locale: string): string {
  if (!countryKey) return '';
  const geo = toGeoLocale(locale);
  const c = countriesData?.[countryKey];
  if (c && c[geo]) return c[geo];
  return countryKey;
}

export function getCountryNativeName(countryKey: string): string | null {
  if (!countryKey) return null;
  const c = countriesData?.[countryKey];
  return c?.native ?? null;
}

export function getCityDisplayName(
  cityId: string,
  cityName: string,
  _countryKey: string,
  locale: string
): string {
  const rec = citiesData?.[cityId];
  if (!rec) return cityName;
  const geo = toGeoLocale(locale);
  const name = rec[geo];
  return (name && name.trim()) ? name : rec.en;
}

export function getCityNativeName(
  cityId: string,
  _cityName: string,
  _countryKey: string
): string | null {
  const rec = citiesData?.[cityId];
  if (rec && rec.native && rec.native.trim() && rec.native !== rec.en) return rec.native;
  return null;
}

export function getCitySearchNames(cityId: string, cityName: string, _countryKey: string): {
  en: string;
  es: string;
  ru: string;
  sr: string;
  native: string;
} {
  const rec = citiesData?.[cityId];
  if (!rec)
    return { en: cityName, es: cityName, ru: cityName, sr: cityName, native: cityName };
  return {
    en: rec.en,
    es: rec.es,
    ru: rec.ru,
    sr: rec.sr,
    native: rec.native,
  };
}

export function getCountrySearchNames(countryKey: string): {
  en: string;
  es: string;
  ru: string;
  sr: string;
  native: string;
} {
  const c = countriesData?.[countryKey];
  if (c)
    return {
      en: c.en,
      es: c.es,
      ru: c.ru,
      sr: c.sr,
      native: c.native,
    };
  return {
    en: countryKey,
    es: countryKey,
    ru: countryKey,
    sr: countryKey,
    native: countryKey,
  };
}

export function getCountriesData(): Record<string, CountryTranslation> | null {
  return countriesData;
}

export function getCitiesData(): Record<string, CityTranslation> | null {
  return citiesData;
}
