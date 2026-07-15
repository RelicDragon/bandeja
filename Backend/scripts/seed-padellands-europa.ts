/**
 * Append Padel Lands clubs for Slovenia / Slovakia (dedupe by cityId + normalizedName).
 *
 *   DB_URL=... DB_SCHEMA=padelpulse npx ts-node -r dotenv/config scripts/seed-padellands-europa.ts slovenia
 *   DRY_RUN=1 ... slovakia
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
  key: string;
  country: string;
  countryCode: string;
  timezone: string;
  cityAliases: Record<string, string>;
};

const CONFIGS: Record<string, CountryCfg> = {
  slovenia: {
    key: 'slovenia',
    country: 'Slovenia',
    countryCode: 'SI',
    timezone: 'Europe/Ljubljana',
    cityAliases: {
      liubliana: 'Ljubljana',
      ljubljana: 'Ljubljana',
      laibach: 'Ljubljana',
    },
  },
  slovakia: {
    key: 'slovakia',
    country: 'Slovakia',
    countryCode: 'SK',
    timezone: 'Europe/Bratislava',
    cityAliases: {
      bratislava: 'Bratislava',
      pressburg: 'Bratislava',
      pozsony: 'Bratislava',
    },
  },
};

const DRY_RUN = process.env.DRY_RUN === '1';

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

function cleanCity(raw: string, aliases: Record<string, string>): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return aliases[trimmed.toLowerCase()] || trimmed;
}

async function getOrCreateCity(
  cfg: CountryCfg,
  cityRaw: string,
  cache: Map<string, { id: string; lat: number | null; lon: number | null }>
): Promise<{ id: string; lat: number | null; lon: number | null; created: boolean }> {
  const resolved = resolveCityName(cfg.country, cfg.countryCode, cityRaw) || cityRaw;
  const name = cleanCity(resolved, cfg.cityAliases);
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return { ...hit, created: false };

  const existing = await prisma.city.findFirst({
    where: { name, country: cfg.country },
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
      country: cfg.country,
      timezone: cfg.timezone,
    },
    select: { id: true, latitude: true, longitude: true },
  });
  await CityGroupService.ensureCityGroupExists(city.id);
  const row = { id: city.id, lat: city.latitude, lon: city.longitude };
  cache.set(key, row);
  return { ...row, created: true };
}

async function seedCountry(cfg: CountryCfg): Promise<void> {
  const dataPath = path.join(__dirname, 'data', `${cfg.key}-padellands-clubs.json`);
  if (!fs.existsSync(dataPath)) throw new Error(`Missing ${dataPath}`);
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as PlClub[];
  const clubs = raw.filter((c) => c?.name && c?.cityRaw && !c.error);
  console.log(`[${cfg.key}-pl] loaded ${raw.length}, usable ${clubs.length}, dryRun=${DRY_RUN}`);

  const existing = await prisma.club.findMany({
    where: { city: { country: cfg.country } },
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
  console.log(`[${cfg.key}-pl] existing ${cfg.country} clubs ${existing.length}`);

  const cityCache = new Map<string, { id: string; lat: number | null; lon: number | null }>();
  let citiesCreated = 0;
  let clubsCreated = 0;
  let skippedDupe = 0;
  let skippedBad = 0;

  for (const pl of clubs) {
    const cityRaw = cleanCity(String(pl.cityRaw), cfg.cityAliases);
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

    const city = await getOrCreateCity(cfg, cityRaw, cityCache);
    if (city.created) citiesCreated++;

    const resolvedCity = cleanCity(
      resolveCityName(cfg.country, cfg.countryCode, cityRaw) || cityRaw,
      cfg.cityAliases
    );
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
      source: 'padellands',
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
  }

  let citiesRefreshed = 0;
  if (!DRY_RUN && process.env.SKIP_CITY_REFRESH !== '1') {
    citiesRefreshed = await refreshAllCitiesFromClubs();
  } else if (!DRY_RUN) {
    console.log(`[${cfg.key}-pl] skipping refreshAllCitiesFromClubs (SKIP_CITY_REFRESH=1)`);
  }

  console.log(
    `[${cfg.key}-pl] done created=${clubsCreated} citiesCreated=${citiesCreated} skippedDupe=${skippedDupe} skippedBad=${skippedBad} citiesRefreshed=${citiesRefreshed}`
  );
}

async function main(): Promise<void> {
  const key = (process.argv[2] || '').toLowerCase();
  const cfg = CONFIGS[key];
  if (!cfg) {
    console.error(`Usage: seed-padellands-europa.ts <${Object.keys(CONFIGS).join('|')}>`);
    process.exit(2);
  }
  await seedCountry(cfg);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
