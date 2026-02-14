import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execSync } from 'child_process';
import prisma from '../src/config/database';

const SHARED_GEO_DIR = path.join(__dirname, '..', '..', 'shared', 'geo');
const DR5HN_DATA_DIR = process.env.DR5HN_REPO_PATH || path.join(__dirname, '..', '..', 'shared', 'dr5hn-data');
const FRONTEND_PUBLIC_GEO = path.join(__dirname, '..', '..', 'Frontend', 'public', 'geo');
const CITY_OVERRIDES_PATH = path.join(SHARED_GEO_DIR, 'city-translation-overrides.json');
const DR5HN_REPO_URL = 'https://github.com/dr5hn/countries-states-cities-database.git';

type CityOverrides = Record<string, Partial<Record<'en' | 'es' | 'ru' | 'sr' | 'native', string>>>;

function loadCityOverrides(): CityOverrides {
  try {
    if (fs.existsSync(CITY_OVERRIDES_PATH)) {
      const raw = fs.readFileSync(CITY_OVERRIDES_PATH, 'utf-8');
      return JSON.parse(raw) as CityOverrides;
    }
  } catch {
    // ignore
  }
  return {};
}

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  Czechia: 'Czech Republic',
};

function normalizeCountryName(name: string): string {
  const trimmed = (name || '').trim();
  return COUNTRY_NAME_ALIASES[trimmed] ?? trimmed;
}

function normalizeCityName(name: string): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

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

interface Dr5hnCountry {
  id: number;
  name: string;
  iso2: string;
  native: string | null;
  translations?: Record<string, string>;
}

interface Dr5hnCity {
  id: number;
  name: string;
  country_code: string;
  native?: string | null;
  translations?: Record<string, string>;
}

interface PkgCityInfo {
  name: string;
  native: string;
  translations: Record<string, string>;
}

function ensureDr5hnData(): void {
  const jsonDir = path.join(DR5HN_DATA_DIR, 'json');
  if (fs.existsSync(path.join(jsonDir, 'countries.json'))) {
    return;
  }
  const parent = path.dirname(DR5HN_DATA_DIR);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
  if (fs.existsSync(DR5HN_DATA_DIR)) {
    throw new Error(`DR5HN data dir exists but missing json/countries.json. Set DR5HN_REPO_PATH or remove ${DR5HN_DATA_DIR}`);
  }
  console.log('Cloning dr5hn/countries-states-cities-database (depth 1)...');
  execSync(`git clone --depth 1 ${DR5HN_REPO_URL} "${DR5HN_DATA_DIR}"`, {
    stdio: 'inherit',
    cwd: parent,
  });
}

function loadDr5hnCountries(): Dr5hnCountry[] {
  const p = path.join(DR5HN_DATA_DIR, 'json', 'countries.json');
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw) as Dr5hnCountry[];
}

function loadDr5hnCities(): Dr5hnCity[] {
  const gzPath = path.join(DR5HN_DATA_DIR, 'json', 'cities.json.gz');
  const jsonPath = path.join(DR5HN_DATA_DIR, 'json', 'cities.json');
  let raw: string;
  if (fs.existsSync(gzPath)) {
    const buf = fs.readFileSync(gzPath);
    raw = zlib.gunzipSync(buf).toString('utf-8');
  } else if (fs.existsSync(jsonPath)) {
    raw = fs.readFileSync(jsonPath, 'utf-8');
  } else {
    throw new Error(`Neither json/cities.json.gz nor json/cities.json found in ${DR5HN_DATA_DIR}`);
  }
  return JSON.parse(raw) as Dr5hnCity[];
}

async function main() {
  ensureDr5hnData();

  const cities = await prisma.city.findMany({
    where: { isCorrect: true },
    select: {
      id: true,
      name: true,
      country: true,
      latitude: true,
      longitude: true,
    },
    orderBy: [{ country: 'asc' }, { name: 'asc' }],
  });

  const distinctCountries = [...new Set(cities.map((c) => normalizeCountryName(c.country)))];

  const dr5hnCountries = loadDr5hnCountries();
  const nameToIso2 = new Map<string, string>();
  const dr5hnByName = new Map<string, Dr5hnCountry>();
  for (const c of dr5hnCountries) {
    const n = c.name.trim();
    nameToIso2.set(n, c.iso2);
    dr5hnByName.set(n, c);
    const normalized = normalizeCountryName(c.name);
    if (normalized !== n) {
      nameToIso2.set(normalized, c.iso2);
      if (!dr5hnByName.has(normalized)) dr5hnByName.set(normalized, c);
    }
  }
  nameToIso2.set('Czech Republic', dr5hnByName.get('Czechia')?.iso2 ?? '');
  if (dr5hnByName.get('Czechia')) {
    dr5hnByName.set('Czech Republic', dr5hnByName.get('Czechia')!);
  }

  const countriesData: Record<string, CountryTranslation> = {};
  for (const countryName of distinctCountries) {
    const dr5hn = dr5hnByName.get(countryName) ?? dr5hnCountries.find((c) => normalizeCountryName(c.name) === countryName);
    if (dr5hn) {
      const t = dr5hn.translations || {};
      countriesData[countryName] = {
        en: dr5hn.name,
        es: t.es ?? dr5hn.name,
        ru: t.ru ?? dr5hn.name,
        sr: t.hr ?? dr5hn.name,
        native: (dr5hn.native && dr5hn.native.trim()) ? dr5hn.native : dr5hn.name,
        iso2: dr5hn.iso2,
      };
    } else {
      countriesData[countryName] = {
        en: countryName,
        es: countryName,
        ru: countryName,
        sr: countryName,
        native: countryName,
        iso2: nameToIso2.get(countryName) ?? '',
      };
    }
  }

  const countryToIso2 = new Map<string, string>();
  for (const [name, data] of Object.entries(countriesData)) {
    if (data.iso2) countryToIso2.set(name, data.iso2);
  }

  console.log('Loading dr5hn cities (may take a moment)...');
  const dr5hnCities = loadDr5hnCities();
  const cityByCountryAndName = new Map<string, PkgCityInfo>();
  for (const pc of dr5hnCities) {
    const iso2 = (pc.country_code || (pc as unknown as { countryCode?: string }).countryCode || '').toUpperCase();
    if (!iso2) continue;
    const key = `${iso2}:${normalizeCityName(pc.name)}`;
    if (cityByCountryAndName.has(key)) continue;
    const t = pc.translations || {};
    cityByCountryAndName.set(key, {
      name: pc.name,
      native: (pc.native && String(pc.native).trim()) ? String(pc.native) : pc.name,
      translations: t,
    });
  }

  const cityOverrides = loadCityOverrides();

  const citiesData: Record<string, CityTranslation> = {};
  for (const city of cities) {
    const countryKey = normalizeCountryName(city.country);
    const iso2 = countryToIso2.get(countryKey);
    let en = city.name;
    let es = city.name;
    let ru = city.name;
    let sr = city.name;
    let native = city.name;
    if (iso2) {
      const key = `${iso2}:${normalizeCityName(city.name)}`;
      const info = cityByCountryAndName.get(key);
      if (info) {
        en = info.name;
        es = info.translations?.es ?? info.name;
        ru = info.translations?.ru ?? info.name;
        sr = info.translations?.hr ?? info.name;
        native = info.native;
      }
    }
    const overrideKey = `${countryKey}:${normalizeCityName(city.name)}`;
    const override = cityOverrides[overrideKey];
    if (override) {
      if (override.en != null && override.en.trim()) en = override.en;
      if (override.es != null && override.es.trim()) es = override.es;
      if (override.ru != null && override.ru.trim()) ru = override.ru;
      if (override.sr != null && override.sr.trim()) sr = override.sr;
      if (override.native != null && override.native.trim()) native = override.native;
    }
    citiesData[city.id] = {
      en,
      es,
      ru,
      sr,
      native,
      countryKey,
    };
  }

  if (!fs.existsSync(SHARED_GEO_DIR)) {
    fs.mkdirSync(SHARED_GEO_DIR, { recursive: true });
  }
  const countriesJson = JSON.stringify(countriesData, null, 0);
  const citiesJson = JSON.stringify(citiesData, null, 0);
  fs.writeFileSync(path.join(SHARED_GEO_DIR, 'countries.json'), countriesJson, 'utf-8');
  fs.writeFileSync(path.join(SHARED_GEO_DIR, 'cities.json'), citiesJson, 'utf-8');

  if (fs.existsSync(path.dirname(FRONTEND_PUBLIC_GEO))) {
    if (!fs.existsSync(FRONTEND_PUBLIC_GEO)) fs.mkdirSync(FRONTEND_PUBLIC_GEO, { recursive: true });
    fs.writeFileSync(path.join(FRONTEND_PUBLIC_GEO, 'countries.json'), countriesJson, 'utf-8');
    fs.writeFileSync(path.join(FRONTEND_PUBLIC_GEO, 'cities.json'), citiesJson, 'utf-8');
    console.log('Copied to Frontend/public/geo');
  }

  console.log('Exported countries:', Object.keys(countriesData).length);
  console.log('Exported cities:', Object.keys(citiesData).length);
  console.log('Written to', SHARED_GEO_DIR);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
