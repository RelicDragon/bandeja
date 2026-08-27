export type GeoLocale =
  | 'en'
  | 'es'
  | 'ru'
  | 'sr'
  | 'cs'
  | 'ar'
  | 'zh'
  | 'id'
  | 'hi'
  | 'th'
  | 'ja';

interface CountryTranslation {
  en: string;
  es: string;
  ru: string;
  sr: string;
  cs?: string;
  zh?: string;
  id?: string;
  hi?: string;
  th?: string;
  ja?: string;
  native: string;
  iso2: string;
}

type CityLocaleKey = 'en' | 'es' | 'ru' | 'sr';

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
        fetch('/geo/countries.json?v=4'),
        fetch('/geo/cities.json?v=4'),
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
  if (
    code === 'en' ||
    code === 'es' ||
    code === 'ru' ||
    code === 'sr' ||
    code === 'cs' ||
    code === 'ar' ||
    code === 'zh' ||
    code === 'id' ||
    code === 'hi' ||
    code === 'th' ||
    code === 'ja'
  ) {
    return code;
  }
  return 'en';
}

const LOCALE_KEYS: Array<'en' | 'es' | 'ru' | 'sr' | 'cs' | 'zh' | 'id' | 'hi' | 'th' | 'ja'> = [
  'en',
  'es',
  'ru',
  'sr',
  'cs',
  'zh',
  'id',
  'hi',
  'th',
  'ja',
];

export function getCountryDisplayName(countryKey: string, locale: string): string {
  if (!countryKey) return '';
  const geo = toGeoLocale(locale);
  const c = countriesData?.[countryKey];
  if (!c) return countryKey;
  if (geo === 'ar') {
    return c.native || c.en || countryKey;
  }
  const name = LOCALE_KEYS.includes(geo)
    ? ({
        en: c.en,
        es: c.es,
        ru: c.ru,
        sr: c.sr,
        cs: c.cs,
        zh: c.zh,
        id: c.id,
        hi: c.hi,
        th: c.th,
        ja: c.ja,
      } as Record<(typeof LOCALE_KEYS)[number], string | undefined>)[geo]
    : undefined;
  if (name) return name;
  return c.native || c.en || countryKey;
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
  if (geo === 'ar' || geo === 'zh' || geo === 'ja' || geo === 'th' || geo === 'hi' || geo === 'id') {
    if (rec.native && rec.native.trim()) return rec.native;
    return rec.en || cityName;
  }
  const key: CityLocaleKey = geo === 'cs' ? 'en' : (geo as CityLocaleKey);
  const name = rec[key];
  return name && name.trim() ? name : rec.en;
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

export function getCitySearchNames(
  cityId: string,
  cityName: string,
  _countryKey: string
): {
  en: string;
  es: string;
  ru: string;
  sr: string;
  native: string;
} {
  const rec = citiesData?.[cityId];
  if (!rec) return { en: cityName, es: cityName, ru: cityName, sr: cityName, native: cityName };
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
  cs: string;
  zh: string;
  id: string;
  hi: string;
  th: string;
  ja: string;
  native: string;
} {
  const c = countriesData?.[countryKey];
  if (c)
    return {
      en: c.en,
      es: c.es,
      ru: c.ru,
      sr: c.sr,
      cs: c.cs ?? c.en,
      zh: c.zh ?? c.native ?? c.en,
      id: c.id ?? c.en,
      hi: c.hi ?? c.native ?? c.en,
      th: c.th ?? c.native ?? c.en,
      ja: c.ja ?? c.native ?? c.en,
      native: c.native,
    };
  return {
    en: countryKey,
    es: countryKey,
    ru: countryKey,
    sr: countryKey,
    cs: countryKey,
    zh: countryKey,
    id: countryKey,
    hi: countryKey,
    th: countryKey,
    ja: countryKey,
    native: countryKey,
  };
}

export function getCountriesData(): Record<string, CountryTranslation> | null {
  return countriesData;
}

export function getCitiesData(): Record<string, CityTranslation> | null {
  return citiesData;
}
