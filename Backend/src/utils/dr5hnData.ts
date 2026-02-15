import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execSync } from 'child_process';

const DR5HN_REPO_URL = 'https://github.com/dr5hn/countries-states-cities-database.git';

function getDr5hnDataDir(): string {
  if (process.env.DR5HN_REPO_PATH) return process.env.DR5HN_REPO_PATH;
  const fromUtils = path.join(__dirname, '..', '..', 'shared', 'dr5hn-data');
  const fromDist = path.join(__dirname, '..', '..', '..', 'shared', 'dr5hn-data');
  if (fs.existsSync(path.join(fromUtils, 'json', 'countries.json'))) return fromUtils;
  if (fs.existsSync(path.join(fromDist, 'json', 'countries.json'))) return fromDist;
  return fromUtils;
}

export const DR5HN_DATA_DIR = getDr5hnDataDir();

export interface Dr5hnCountry {
  id: number;
  name: string;
  iso2: string;
  native: string | null;
  translations?: Record<string, string>;
}

export interface Dr5hnCity {
  id: number;
  name: string;
  country_code: string;
  native?: string | null;
  translations?: Record<string, string>;
}

export function ensureDr5hnData(): void {
  const jsonDir = path.join(DR5HN_DATA_DIR, 'json');
  if (fs.existsSync(path.join(jsonDir, 'countries.json'))) return;
  const parent = path.dirname(DR5HN_DATA_DIR);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  if (fs.existsSync(DR5HN_DATA_DIR)) {
    throw new Error(
      `DR5HN data dir exists but missing json/countries.json. Set DR5HN_REPO_PATH or remove ${DR5HN_DATA_DIR}`
    );
  }
  execSync(`git clone --depth 1 ${DR5HN_REPO_URL} "${DR5HN_DATA_DIR}"`, {
    stdio: 'inherit',
    cwd: parent,
  });
}

export function loadDr5hnCountries(): Dr5hnCountry[] {
  const p = path.join(DR5HN_DATA_DIR, 'json', 'countries.json');
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw) as Dr5hnCountry[];
}

export function loadDr5hnCities(): Dr5hnCity[] {
  const gzPath = path.join(DR5HN_DATA_DIR, 'json', 'cities.json.gz');
  const jsonPath = path.join(DR5HN_DATA_DIR, 'json', 'cities.json');
  if (fs.existsSync(gzPath)) {
    const buf = fs.readFileSync(gzPath);
    const raw = zlib.gunzipSync(buf).toString('utf-8');
    return JSON.parse(raw) as Dr5hnCity[];
  }
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    return JSON.parse(raw) as Dr5hnCity[];
  }
  return [];
}

export function dr5hnCitiesAvailable(): boolean {
  const p = path.join(DR5HN_DATA_DIR, 'json', 'countries.json');
  return fs.existsSync(p);
}
