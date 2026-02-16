import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execSync } from 'child_process';

const DR5HN_DATA_DIR =
  process.env.DR5HN_REPO_PATH || path.join(__dirname, '..', '..', '..', 'shared', 'dr5hn-data');
const DR5HN_REPO_URL = 'https://github.com/dr5hn/countries-states-cities-database.git';

interface Dr5hnCountry {
  id: number;
  name: string;
  iso2: string;
  native?: string | null;
  translations?: Record<string, string>;
}

interface Dr5hnCity {
  id: number;
  name: string;
  country_code: string;
  native?: string | null;
  translations?: Record<string, string>;
}

const COUNTRY_ALIASES: Record<string, string> = {
  'Czech Republic': 'Czechia',
};

function normalize(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

let countryByIso2: Map<string, Dr5hnCountry> | null = null;
let countryByName: Map<string, Dr5hnCountry> | null = null;
let cityLookup: Map<string, string> | null = null;

function ensureDr5hnData(): void {
  const jsonDir = path.join(DR5HN_DATA_DIR, 'json');
  if (fs.existsSync(path.join(jsonDir, 'countries.json'))) return;
  const parent = path.dirname(DR5HN_DATA_DIR);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  if (fs.existsSync(DR5HN_DATA_DIR)) {
    throw new Error(
      `DR5HN dir exists but missing json/countries.json. Set DR5HN_REPO_PATH or remove ${DR5HN_DATA_DIR}`
    );
  }
  console.log('[dr5hn] Cloning countries-states-cities-database (depth 1)...');
  execSync(`git clone --depth 1 ${DR5HN_REPO_URL} "${DR5HN_DATA_DIR}"`, { stdio: 'inherit', cwd: parent });
}

function loadCountries(): void {
  if (countryByIso2 != null) return;
  ensureDr5hnData();
  const p = path.join(DR5HN_DATA_DIR, 'json', 'countries.json');
  const raw = fs.readFileSync(p, 'utf-8');
  const list = JSON.parse(raw) as Dr5hnCountry[];
  countryByIso2 = new Map();
  countryByName = new Map();
  for (const c of list) {
    const n = (c.name || '').trim();
    if (c.iso2) countryByIso2.set(c.iso2.toUpperCase(), c);
    if (n) countryByName.set(normalize(n), c);
    if (c.native && String(c.native).trim()) countryByName.set(normalize(String(c.native)), c);
    const t = c.translations || {};
    for (const v of Object.values(t)) if (v && String(v).trim()) countryByName.set(normalize(String(v)), c);
  }
  for (const [alias, canonical] of Object.entries(COUNTRY_ALIASES)) {
    const c = countryByName.get(normalize(canonical));
    if (c) countryByName.set(normalize(alias), c);
  }
}

function loadCities(): void {
  if (cityLookup != null) return;
  loadCountries();
  const gzPath = path.join(DR5HN_DATA_DIR, 'json', 'cities.json.gz');
  const jsonPath = path.join(DR5HN_DATA_DIR, 'json', 'cities.json');
  let raw: string;
  if (fs.existsSync(gzPath)) {
    raw = zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf-8');
  } else if (fs.existsSync(jsonPath)) {
    raw = fs.readFileSync(jsonPath, 'utf-8');
  } else {
    throw new Error(`Neither cities.json.gz nor cities.json in ${DR5HN_DATA_DIR}`);
  }
  const list = JSON.parse(raw) as Dr5hnCity[];
  cityLookup = new Map();
  for (const pc of list) {
    const iso2 = (pc.country_code || (pc as { countryCode?: string }).countryCode || '').toUpperCase();
    if (!iso2) continue;
    const englishName = (pc.name || '').trim();
    if (!englishName) continue;
    const keys: string[] = [normalize(englishName)];
    if (pc.native && String(pc.native).trim()) keys.push(normalize(String(pc.native)));
    const t = pc.translations || {};
    for (const v of Object.values(t)) if (v && String(v).trim()) keys.push(normalize(String(v)));
    for (const k of keys) {
      const key = `${iso2}:${k}`;
      if (!cityLookup!.has(key)) cityLookup!.set(key, englishName);
    }
  }
}

export function getCountryIso2(countryName: string): string | null {
  loadCountries();
  const n = normalize(countryName);
  const c = countryByName!.get(n) ?? countryByIso2!.get(countryName.trim().toUpperCase());
  return c?.iso2?.toUpperCase() ?? null;
}

export function resolveCityName(countryName: string, countryCode: string | null, cityName: string): string {
  loadCities();
  const iso2 =
    (countryCode && countryCode.trim().length === 2 ? countryCode.trim().toUpperCase() : null) ??
    getCountryIso2(countryName);
  if (!iso2) return cityName.trim();
  const key = `${iso2}:${normalize(cityName)}`;
  const canonical = cityLookup!.get(key);
  return canonical ?? cityName.trim();
}
