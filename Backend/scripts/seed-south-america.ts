/**
 * Seed South America clubs from HayCancha + Padel Lands + Padelizados (dedupe city+normalizedName).
 *
 *   DB_URL=... DB_SCHEMA=padelpulse SKIP_CITY_GROUP=1 SKIP_CITY_REFRESH=1 \
 *     npx ts-node -r dotenv/config scripts/seed-south-america.ts argentina
 *   ... seed-south-america.ts all
 *   DRY_RUN=1 ... brazil
 */
import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { Prisma, Sport } from '@prisma/client';
import prisma from '../src/config/database';
import { normalizeClubName } from '../src/utils/normalizeClubName';
import { resolveCityName } from './lib/dr5hnCityResolver';
import { CityGroupService } from '../src/services/chat/cityGroup.service';
import { refreshAllCitiesFromClubs } from '../src/utils/updateCityCenter';
import { normalizeClubSportsOrder } from '../src/shared/clubSports';

type CountryCfg = {
  key: string;
  country: string;
  countryCode: string;
  timezone: string;
  cityAliases: Record<string, string>;
};

const CONFIGS: Record<string, CountryCfg> = {
  argentina: {
    key: 'argentina',
    country: 'Argentina',
    countryCode: 'AR',
    timezone: 'America/Argentina/Buenos_Aires',
    cityAliases: {
      caba: 'Buenos Aires',
      'ciudad autonoma de buenos aires': 'Buenos Aires',
      'ciudad autónoma de buenos aires': 'Buenos Aires',
      cordoba: 'Córdoba',
      córdoba: 'Córdoba',
    },
  },
  bolivia: {
    key: 'bolivia',
    country: 'Bolivia',
    countryCode: 'BO',
    timezone: 'America/La_Paz',
    cityAliases: {
      'santa cruz': 'Santa Cruz de la Sierra',
      'santa cruz de la sierra': 'Santa Cruz de la Sierra',
    },
  },
  brazil: {
    key: 'brazil',
    country: 'Brazil',
    countryCode: 'BR',
    timezone: 'America/Sao_Paulo',
    cityAliases: {
      'sao paulo': 'São Paulo',
      'são paulo': 'São Paulo',
      brasilia: 'Brasília',
      brasília: 'Brasília',
    },
  },
  chile: {
    key: 'chile',
    country: 'Chile',
    countryCode: 'CL',
    timezone: 'America/Santiago',
    cityAliases: {
      'santiago de chile': 'Santiago',
      valparaiso: 'Valparaíso',
      'vina del mar': 'Viña del Mar',
      'viña del mar': 'Viña del Mar',
      concepcion: 'Concepción',
    },
  },
  colombia: {
    key: 'colombia',
    country: 'Colombia',
    countryCode: 'CO',
    timezone: 'America/Bogota',
    cityAliases: {
      bogota: 'Bogotá',
      bogotá: 'Bogotá',
      medellin: 'Medellín',
      medellín: 'Medellín',
    },
  },
  ecuador: {
    key: 'ecuador',
    country: 'Ecuador',
    countryCode: 'EC',
    timezone: 'America/Guayaquil',
    cityAliases: {},
  },
  guyana: {
    key: 'guyana',
    country: 'Guyana',
    countryCode: 'GY',
    timezone: 'America/Guyana',
    cityAliases: {
      georgetown: 'Georgetown',
    },
  },
  paraguay: {
    key: 'paraguay',
    country: 'Paraguay',
    countryCode: 'PY',
    timezone: 'America/Asuncion',
    cityAliases: {
      asuncion: 'Asunción',
      asunción: 'Asunción',
    },
  },
  peru: {
    key: 'peru',
    country: 'Peru',
    countryCode: 'PE',
    timezone: 'America/Lima',
    cityAliases: {
      cuzco: 'Cusco',
    },
  },
  suriname: {
    key: 'suriname',
    country: 'Suriname',
    countryCode: 'SR',
    timezone: 'America/Paramaribo',
    cityAliases: {
      paramaribo: 'Paramaribo',
    },
  },
  uruguay: {
    key: 'uruguay',
    country: 'Uruguay',
    countryCode: 'UY',
    timezone: 'America/Montevideo',
    cityAliases: {
      colonia: 'Colonia del Sacramento',
    },
  },
  venezuela: {
    key: 'venezuela',
    country: 'Venezuela',
    countryCode: 'VE',
    timezone: 'America/Caracas',
    cityAliases: {},
  },
};

const DRY_RUN = process.env.DRY_RUN === '1';
const SKIP_CITY_GROUP = process.env.SKIP_CITY_GROUP === '1';
const SKIP_CITY_REFRESH = process.env.SKIP_CITY_REFRESH === '1';

type RawClub = {
  id?: string | number;
  name: string;
  slug?: string;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  cityRaw?: string | null;
  courtsNumber?: number | null;
  avatarUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sourceUrl?: string | null;
  description?: string | null;
  sports?: string[] | null;
  source?: string | null;
  error?: string;
};

function cleanCity(raw: string, aliases: Record<string, string>): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return aliases[trimmed.toLowerCase()] || trimmed;
}

function mapSports(raw: string[] | null | undefined): Sport[] {
  const out: Sport[] = [];
  for (const s of raw || ['PADEL']) {
    const up = String(s).toUpperCase();
    if (up === 'PADEL' || up === 'TENNIS' || up === 'PICKLEBALL') {
      const sport = up as Sport;
      if (!out.includes(sport)) out.push(sport);
    }
  }
  if (!out.length) out.push(Sport.PADEL);
  return normalizeClubSportsOrder(out);
}

function loadSourceFiles(key: string): RawClub[] {
  const dir = path.join(__dirname, 'data');
  const files = [
    `${key}-haycancha-clubs.json`,
    `${key}-padellands-clubs.json`,
    `${key}-padelizados-clubs.json`,
    `${key}-manual-clubs.json`,
  ];
  const all: RawClub[] = [];
  for (const file of files) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) continue;
    const rows = JSON.parse(fs.readFileSync(p, 'utf-8')) as RawClub[];
    const source = file.includes('haycancha')
      ? 'haycancha'
      : file.includes('padelizados')
        ? 'padelizados'
        : file.includes('manual')
          ? 'manual'
          : 'padellands';
    for (const row of rows) {
      if (!row?.name || row.error) continue;
      all.push({ ...row, source: row.source || source });
    }
    console.log(`[sa-${key}] loaded ${file}: ${rows.length}`);
  }
  return all;
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
  if (!SKIP_CITY_GROUP) {
    try {
      await CityGroupService.ensureCityGroupExists(city.id);
    } catch (e) {
      console.warn(`[sa-${cfg.key}] cityGroup skip for ${name}:`, (e as Error)?.message || e);
    }
  }
  const row = { id: city.id, lat: city.latitude, lon: city.longitude };
  cache.set(key, row);
  return { ...row, created: true };
}

async function seedCountry(cfg: CountryCfg): Promise<void> {
  const clubs = loadSourceFiles(cfg.key).filter((c) => c.name && c.cityRaw);
  console.log(`[sa-${cfg.key}] usable ${clubs.length}, dryRun=${DRY_RUN}`);

  const existing = await prisma.club.findMany({
    where: { city: { country: cfg.country } },
    select: {
      id: true,
      normalizedName: true,
      cityId: true,
      sports: true,
      city: { select: { name: true } },
    },
  });
  const byCityNorm = new Map(existing.map((c) => [`${c.cityId}|${c.normalizedName}`, c]));
  const byCityNameNorm = new Map(
    existing.map((c) => [`${c.city.name.toLowerCase()}|${c.normalizedName}`, c])
  );
  console.log(`[sa-${cfg.key}] existing ${cfg.country} clubs ${existing.length}`);

  const cityCache = new Map<string, { id: string; lat: number | null; lon: number | null }>();
  let citiesCreated = 0;
  let clubsCreated = 0;
  let sportsMerged = 0;
  let skippedDupe = 0;
  let skippedBad = 0;

  // Prefer HayCancha first (multisport), then padellands, then padelizados
  const rank = (s: string | null | undefined) =>
    s === 'haycancha' ? 0 : s === 'padellands' ? 1 : 2;
  clubs.sort((a, b) => rank(a.source) - rank(b.source));

  for (const raw of clubs) {
    const cityRaw = cleanCity(String(raw.cityRaw), cfg.cityAliases);
    if (!cityRaw) {
      skippedBad++;
      continue;
    }
    const name = String(raw.name).trim();
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
    const existingClub = byCityNorm.get(keyId) || byCityNameNorm.get(keyName);
    const sports = mapSports(raw.sports);

    if (existingClub) {
      const merged = normalizeClubSportsOrder([
        ...new Set([...(existingClub.sports || []), ...sports]),
      ]);
      const needsSportUpdate =
        merged.length !== (existingClub.sports || []).length ||
        merged.some((s, i) => s !== (existingClub.sports || [])[i]);
      if (needsSportUpdate && !DRY_RUN) {
        await prisma.club.update({
          where: { id: existingClub.id },
          data: { sports: merged },
        });
        existingClub.sports = merged;
        sportsMerged++;
      } else {
        skippedDupe++;
      }
      continue;
    }

    const address = (raw.address || cityRaw).trim() || cityRaw;
    const lat =
      typeof raw.latitude === 'number' && Number.isFinite(raw.latitude) ? raw.latitude : city.lat;
    const lon =
      typeof raw.longitude === 'number' && Number.isFinite(raw.longitude) ? raw.longitude : city.lon;
    const avatar = (raw.avatarUrl || '').trim() || null;
    const phone = (raw.phone || '').trim() || null;
    const website = (raw.website || '').trim() || null;
    const courtsNumber =
      typeof raw.courtsNumber === 'number' && Number.isFinite(raw.courtsNumber)
        ? Math.max(0, Math.floor(raw.courtsNumber))
        : 0;

    const meta = {
      source: raw.source || 'south-america-import',
      sourceId: raw.id,
      slug: raw.slug,
      sourceUrl: raw.sourceUrl,
      description: raw.description,
    } as Prisma.InputJsonValue;

    if (DRY_RUN) {
      clubsCreated++;
      byCityNorm.set(keyId, { id: `dry-${clubsCreated}`, sports, cityId: city.id, normalizedName: normalized, city: { name: resolvedCity } });
      byCityNameNorm.set(keyName, byCityNorm.get(keyId)!);
      continue;
    }

    const created = await prisma.club.create({
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
        sports,
        ptMeta: meta,
      } as Prisma.ClubUncheckedCreateInput,
      select: { id: true, sports: true },
    });
    clubsCreated++;
    const stub = {
      id: created.id,
      sports: created.sports,
      cityId: city.id,
      normalizedName: normalized,
      city: { name: resolvedCity },
    };
    byCityNorm.set(keyId, stub);
    byCityNameNorm.set(keyName, stub);
  }

  let citiesRefreshed = 0;
  if (!DRY_RUN && !SKIP_CITY_REFRESH) {
    citiesRefreshed = await refreshAllCitiesFromClubs();
  } else if (!DRY_RUN) {
    console.log(`[sa-${cfg.key}] skipping refreshAllCitiesFromClubs (SKIP_CITY_REFRESH=1)`);
  }

  console.log(
    `[sa-${cfg.key}] done created=${clubsCreated} citiesCreated=${citiesCreated} sportsMerged=${sportsMerged} skippedDupe=${skippedDupe} skippedBad=${skippedBad} citiesRefreshed=${citiesRefreshed}`
  );
}

async function main(): Promise<void> {
  const arg = (process.argv[2] || '').toLowerCase();
  const keys =
    arg === 'all'
      ? Object.keys(CONFIGS)
      : arg
        ? arg.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
  if (!keys.length || keys.some((k) => !CONFIGS[k])) {
    console.error(`Usage: seed-south-america.ts <${Object.keys(CONFIGS).join('|')}|all>`);
    process.exit(2);
  }
  for (const key of keys) {
    await seedCountry(CONFIGS[key]);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
