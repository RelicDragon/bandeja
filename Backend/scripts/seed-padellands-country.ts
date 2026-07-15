/**
 * Append Padel Lands clubs for a country (dedupe by cityId + normalizedName).
 *
 *   COUNTRY_KEY=bulgaria DB_URL=... DB_SCHEMA=padelpulse \
 *     npx ts-node -r dotenv/config scripts/seed-padellands-country.ts
 *   DRY_RUN=1 ...
 *
 * COUNTRY_KEY ∈ bulgaria | moldova | north-macedonia
 */
import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { normalizeClubName } from '../src/utils/normalizeClubName';
import { resolveCityName } from './lib/dr5hnCityResolver';
import { CityGroupService } from '../src/services/chat/cityGroup.service';
import { refreshAllCitiesFromClubs } from '../src/utils/updateCityCenter';

type CountryCfg = {
  country: string;
  countryCode: string;
  timezone: string;
  dataFile: string;
  logTag: string;
};

const COUNTRY_CFGS: Record<string, CountryCfg> = {
  bulgaria: {
    country: 'Bulgaria',
    countryCode: 'BG',
    timezone: 'Europe/Sofia',
    dataFile: 'bulgaria-padellands-clubs.json',
    logTag: 'bulgaria-pl',
  },
  moldova: {
    country: 'Moldova',
    countryCode: 'MD',
    timezone: 'Europe/Chisinau',
    dataFile: 'moldova-padellands-clubs.json',
    logTag: 'moldova-pl',
  },
  'north-macedonia': {
    country: 'North Macedonia',
    countryCode: 'MK',
    timezone: 'Europe/Skopje',
    dataFile: 'north-macedonia-clubs.json',
    logTag: 'mk-pl',
  },
};

const KEY = (process.env.COUNTRY_KEY || '').trim().toLowerCase();
const CFG = COUNTRY_CFGS[KEY];
if (!CFG) {
  throw new Error(
    `Set COUNTRY_KEY to one of: ${Object.keys(COUNTRY_CFGS).join(', ')}`
  );
}

const DATA_PATH = path.join(__dirname, 'data', CFG.dataFile);
const DRY_RUN = process.env.DRY_RUN === '1';
const SKIP_REFRESH = process.env.SKIP_REFRESH === '1';

type PlClub = {
  id: number;
  name: string;
  slug?: string;
  address?: string | null;
  phone?: string | null;
  cityRaw?: string | null;
  courtsNumber?: number | null;
  avatarUrl?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sourceUrl?: string;
  description?: string;
  error?: string;
};

function cleanCity(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

async function getOrCreateCity(
  cityRaw: string,
  cache: Map<string, { id: string; lat: number | null; lon: number | null }>
): Promise<{ id: string; lat: number | null; lon: number | null; created: boolean }> {
  const resolved = resolveCityName(CFG.country, CFG.countryCode, cityRaw) || cityRaw;
  const name = cleanCity(resolved);
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return { ...hit, created: false };

  const existing = await prisma.city.findFirst({
    where: { name, country: CFG.country },
    select: { id: true, latitude: true, longitude: true },
  });
  if (existing) {
    const row = { id: existing.id, lat: existing.latitude, lon: existing.longitude };
    cache.set(key, row);
    return { ...row, created: false };
  }

  if (DRY_RUN) {
    const fake = { id: `dry-${key}`, lat: null as number | null, lon: null as number | null };
    cache.set(key, fake);
    return { ...fake, created: true };
  }

  const city = await prisma.city.create({
    data: {
      name,
      country: CFG.country,
      timezone: CFG.timezone,
    },
    select: { id: true, latitude: true, longitude: true },
  });
  await CityGroupService.ensureCityGroupExists(city.id);
  const row = { id: city.id, lat: city.latitude, lon: city.longitude };
  cache.set(key, row);
  return { ...row, created: true };
}

async function main(): Promise<void> {
  if (!fs.existsSync(DATA_PATH)) throw new Error(`Missing ${DATA_PATH}`);
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')) as PlClub[];
  const clubs = raw.filter((c) => c?.name && c?.cityRaw && !c.error);
  console.log(
    `[${CFG.logTag}] loaded ${raw.length}, usable ${clubs.length}, dryRun=${DRY_RUN}`
  );

  const existing = await prisma.club.findMany({
    where: { city: { country: CFG.country } },
    select: {
      id: true,
      normalizedName: true,
      cityId: true,
      city: { select: { name: true } },
    },
  });
  const byCityNorm = new Set(existing.map((c) => `${c.cityId}|${c.normalizedName}`));
  const byCityNameNorm = new Set(
    existing.map((c) => `${c.city.name.toLowerCase()}|${c.normalizedName}`)
  );
  console.log(`[${CFG.logTag}] existing ${CFG.country} clubs ${existing.length}`);

  const cityCache = new Map<string, { id: string; lat: number | null; lon: number | null }>();
  let citiesCreated = 0;
  let clubsCreated = 0;
  let skippedDupe = 0;
  let skippedBad = 0;

  for (const pl of clubs) {
    const cityRaw = cleanCity(String(pl.cityRaw));
    if (!cityRaw) {
      skippedBad++;
      continue;
    }
    const name = String(pl.name).trim();
    const normalized = normalizeClubName(name);
    if (!normalized) {
      skippedBad++;
      continue;
    }

    const city = await getOrCreateCity(cityRaw, cityCache);
    if (city.created) citiesCreated++;

    const resolvedCity = resolveCityName(CFG.country, CFG.countryCode, cityRaw) || cityRaw;
    const keyId = `${city.id}|${normalized}`;
    const keyName = `${resolvedCity.toLowerCase()}|${normalized}`;
    if (byCityNorm.has(keyId) || byCityNameNorm.has(keyName)) {
      skippedDupe++;
      continue;
    }

    const address = (pl.address || cityRaw).trim() || cityRaw;
    const lat =
      typeof pl.latitude === 'number' && Number.isFinite(pl.latitude) ? pl.latitude : city.lat;
    const lon =
      typeof pl.longitude === 'number' && Number.isFinite(pl.longitude) ? pl.longitude : city.lon;
    const avatar = (pl.avatarUrl || '').trim() || null;
    const phone = (pl.phone || '').trim() || null;
    const website = (pl.website || '').trim() || null;
    const courtsNumber =
      typeof pl.courtsNumber === 'number' && Number.isFinite(pl.courtsNumber)
        ? Math.max(0, Math.floor(pl.courtsNumber))
        : 0;

    const meta = {
      source: pl.id >= 900000 ? 'federation-manual' : 'padellands',
      padellandsId: pl.id,
      slug: pl.slug,
      sourceUrl: pl.sourceUrl,
      description: pl.description,
    } as Prisma.InputJsonValue;

    if (DRY_RUN) {
      clubsCreated++;
      byCityNorm.add(keyId);
      byCityNameNorm.add(keyName);
      continue;
    }

    await prisma.club.create({
      data: {
        name,
        normalizedName: normalized,
        address,
        cityId: city.id,
        phone,
        website,
        avatar,
        latitude: lat,
        longitude: lon,
        courtsNumber,
        sports: ['PADEL'],
        ptMeta: meta,
      } as Prisma.ClubUncheckedCreateInput,
    });
    clubsCreated++;
    byCityNorm.add(keyId);
    byCityNameNorm.add(keyName);

    if (clubsCreated % 50 === 0) {
      console.log(
        `[${CFG.logTag}] progress created=${clubsCreated} citiesCreated=${citiesCreated} skippedDupe=${skippedDupe}`
      );
    }
  }

  let citiesRefreshed = 0;
  if (!DRY_RUN && !SKIP_REFRESH) {
    citiesRefreshed = await refreshAllCitiesFromClubs();
  }

  console.log(
    `[${CFG.logTag}] done created=${clubsCreated} citiesCreated=${citiesCreated} skippedDupe=${skippedDupe} skippedBad=${skippedBad} citiesRefreshed=${citiesRefreshed}`
  );
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
