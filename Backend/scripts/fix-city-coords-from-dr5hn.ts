/**
 * Set club + city coords from dr5hn (Nominatim fallback), then isCorrect via refreshCityFromClubs.
 *
 *   DB_URL=... DB_SCHEMA=padelpulse npx ts-node -r dotenv/config scripts/fix-city-coords-from-dr5hn.ts
 *   COUNTRIES=Austria,Poland ...
 *   DRY_RUN=1 ...
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { resolveCityCoords } from './lib/dr5hnCityResolver';
import { refreshCityFromClubs } from '../src/utils/updateCityCenter';

const DRY_RUN = process.env.DRY_RUN === '1';
const USE_NOMINATIM = process.env.NOMINATIM !== '0';
const COUNTRIES = (process.env.COUNTRIES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const RATE_MS = 1100;
let lastNom = 0;

async function nominatim(city: string, country: string): Promise<{ lat: number; lon: number } | null> {
  const now = Date.now();
  const wait = RATE_MS - (now - lastNom);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNom = Date.now();
  const q = `${city}, ${country}`;
  const params = new URLSearchParams({ q, format: 'json', limit: '1' });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': 'BandejaCityFix/1.0 (https://bandeja.com)' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  const first = data?.[0];
  if (!first?.lat || !first?.lon) return null;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function hasRealCoords(lat: number | null, lon: number | null): boolean {
  return lat != null && lon != null && !(lat === 0 && lon === 0);
}

async function main(): Promise<void> {
  const cities = await prisma.city.findMany({
    where: {
      isCorrect: false,
      ...(COUNTRIES.length ? { country: { in: COUNTRIES } } : {}),
      clubs: { some: { isActive: true } },
    },
    select: {
      id: true,
      name: true,
      country: true,
      clubs: {
        where: { isActive: true },
        select: { id: true, latitude: true, longitude: true },
      },
    },
    orderBy: [{ country: 'asc' }, { name: 'asc' }],
  });

  console.log(`[fix-coords] cities=${cities.length} dryRun=${DRY_RUN} countries=${COUNTRIES.join('|') || '*'}`);

  let fixed = 0;
  let missed = 0;
  let clubsUpdated = 0;

  for (const city of cities) {
    let coords = resolveCityCoords(city.country, null, city.name);
    if (!coords && USE_NOMINATIM) {
      const nom = await nominatim(city.name, city.country);
      if (nom) coords = { name: city.name, lat: nom.lat, lon: nom.lon };
    }
    if (!coords) {
      missed++;
      console.log(`[miss] ${city.country} / ${city.name}`);
      continue;
    }

    const needClubUpdate = city.clubs.filter((c) => !hasRealCoords(c.latitude, c.longitude));
    if (DRY_RUN) {
      fixed++;
      clubsUpdated += needClubUpdate.length;
      continue;
    }

    if (needClubUpdate.length) {
      await prisma.club.updateMany({
        where: { id: { in: needClubUpdate.map((c) => c.id) } },
        data: { latitude: coords.lat, longitude: coords.lon },
      });
      clubsUpdated += needClubUpdate.length;
    }

    await refreshCityFromClubs(city.id);
    fixed++;
    if (fixed % 25 === 0) {
      console.log(`[fix-coords] progress fixed=${fixed} clubsUpdated=${clubsUpdated} missed=${missed}`);
    }
  }

  console.log(`[fix-coords] done fixed=${fixed} clubsUpdated=${clubsUpdated} missed=${missed}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
