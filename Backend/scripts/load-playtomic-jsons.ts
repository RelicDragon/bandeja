import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { normalizeClubName } from '../src/utils/normalizeClubName';
import { normalizeCountry } from '../src/utils/normalizePlaytomicCountry';
import { refreshClubCourtsCount } from '../src/utils/refreshClubCourtsCount';
import { resolveCityName } from './lib/dr5hnCityResolver';

const JSON_DIR = path.join(__dirname, '..', 'additions', 'playtomic', 'jsons');
const PADEL = 'PADEL';
const DEFAULT_TIMEZONE = 'Europe/Paris';

interface PtAddress {
  street?: string;
  postal_code?: string;
  city: string;
  sub_administrative_area?: string;
  administrative_area?: string;
  country: string;
  country_code?: string;
  coordinate?: { lat?: number | string; lon?: number | string };
  timezone?: string;
}

interface PtResource {
  resourceId: string;
  name: string;
  sport: string;
  features?: string[];
}

interface PtClub {
  tenant_id: string;
  tenant_name: string;
  slug?: string;
  address: PtAddress;
  properties?: Record<string, string>;
  resources?: PtResource[];
  opening_hours?: Record<string, { opening_time?: string; closing_time?: string }>;
  sport_ids?: string[];
  description?: string;
}

function buildAddress(addr: PtAddress): string {
  const parts = [addr.street, addr.postal_code, addr.city, addr.country].filter(Boolean);
  return parts.map(String).join(', ');
}

function parseCoord(coord: PtAddress['coordinate']): { lat: number; lon: number } | null {
  if (coord == null) return null;
  const rawLat = coord.lat;
  const rawLon = coord.lon;
  const lat = typeof rawLat === 'string' ? parseFloat(rawLat) : rawLat;
  const lon = typeof rawLon === 'string' ? parseFloat(rawLon) : rawLon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

async function getOrCreateCity(
  addr: PtAddress,
  countryCode: string | null
): Promise<{ id: string; created: boolean }> {
  const country = (addr.country || '').trim();
  const canonicalName = resolveCityName(country, countryCode, addr.city || '');
  const name = canonicalName;
  const timezone = (addr.timezone || DEFAULT_TIMEZONE).trim();
  const subAdministrativeArea = (addr.sub_administrative_area || '').trim() || null;
  const administrativeArea = (addr.administrative_area || '').trim() || null;

  const existing = await prisma.city.findFirst({
    where: { name, country },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const city = await prisma.city.create({
    data: {
      name,
      country,
      timezone,
      subAdministrativeArea,
      administrativeArea,
    },
    select: { id: true },
  });
  return { id: city.id, created: true };
}

async function getOrCreateClub(
  pt: PtClub,
  cityId: string
): Promise<{ id: string; created: boolean }> {
  const name = (pt.tenant_name || '').trim();
  const normalized = normalizeClubName(name);
  const address = buildAddress(pt.address);
  const coord = pt.address?.coordinate;
  const props = pt.properties || {};
  const phone = (props.CONTACT_PHONE || '').trim() || null;
  const website = (props.WEBSITE_URL || '').trim() || null;
  const description = (pt.description || '').trim() || null;
  const ptMeta = JSON.parse(JSON.stringify(pt)) as Prisma.InputJsonValue;

  const existing = await prisma.club.findFirst({
    where: { cityId, normalizedName: normalized },
    select: { id: true },
  });
  if (existing) {
    await prisma.club.update({
      where: { id: existing.id },
      data: { ptMeta } as Prisma.ClubUncheckedUpdateInput,
    });
    return { id: existing.id, created: false };
  }

  const club = await prisma.club.create({
    data: {
      name,
      normalizedName: normalized,
      address,
      cityId,
      description,
      phone,
      website,
      latitude: coord != null ? Number(coord.lat) : null,
      longitude: coord != null ? Number(coord.lon) : null,
      ptMeta,
    } as Prisma.ClubUncheckedCreateInput,
    select: { id: true },
  });
  return { id: club.id, created: true };
}

async function getOrCreateCourt(
  clubId: string,
  res: PtResource
): Promise<boolean> {
  const externalCourtId = res.resourceId;
  const existing = await prisma.court.findFirst({
    where: { clubId, externalCourtId },
    select: { id: true },
  });
  if (existing) return false;

  const isIndoor = (res.features || []).some((f) => f.toLowerCase() === 'indoor');
  const surfaceType = (res.features || []).find(
    (f) =>
      ['crystal', 'quick', 'synthetic_grass', 'clay', 'cement', 'grass'].includes(
        f.toLowerCase()
      )
  ) || null;

  await prisma.court.create({
    data: {
      name: res.name,
      clubId,
      externalCourtId,
      isIndoor,
      surfaceType,
    },
  });
  return true;
}

async function loadFile(filePath: string): Promise<{
  clubsProcessed: number;
  clubsSkipped: number;
  citiesCreated: number;
  clubsCreated: number;
  courtsCreated: number;
}> {
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  const data: PtClub[] = JSON.parse(raw);
  let clubsProcessed = 0;
  let clubsSkipped = 0;
  let citiesCreated = 0;
  let clubsCreated = 0;
  let courtsCreated = 0;
  const cityIdsByKey = new Map<string, string>();

  for (const pt of data) {
    const sportIds = pt.sport_ids || [];
    if (!sportIds.includes(PADEL)) {
      clubsSkipped++;
      continue;
    }

    const addr = pt.address;
    if (!addr?.city || !addr?.country) {
      clubsSkipped++;
      continue;
    }
    const parsedCoord = parseCoord(addr.coordinate);
    if (!parsedCoord) {
      clubsSkipped++;
      continue;
    }
    addr.coordinate = parsedCoord;

    // Use only this club's country/country_code (file may contain multiple countries)
    const { country, country_code } = normalizeCountry(addr.country, addr.country_code);
    const normalizedAddr: PtAddress = {
      ...addr,
      country,
      country_code: country_code || addr.country_code,
    };
    pt.address = normalizedAddr;

    const countryCode = normalizedAddr.country_code || null;
    const cityKey = `${resolveCityName(normalizedAddr.country, countryCode, addr.city)}|${country_code || normalizedAddr.country}`;
    let cityId = cityIdsByKey.get(cityKey);
    if (!cityId) {
      const city = await getOrCreateCity(normalizedAddr, countryCode);
      cityId = city.id;
      cityIdsByKey.set(cityKey, cityId);
      if (city.created) citiesCreated++;
    }

    const club = await getOrCreateClub(pt, cityId);
    clubsProcessed++;
    if (club.created) clubsCreated++;

    const padelResources = (pt.resources || []).filter(
      (r) => (r.sport || '').toUpperCase() === PADEL
    );
    let courtsCreatedForClub = 0;
    for (const res of padelResources) {
      const created = await getOrCreateCourt(club.id, res);
      if (created) {
        courtsCreated++;
        courtsCreatedForClub++;
      }
    }
    if (courtsCreatedForClub > 0) await refreshClubCourtsCount(club.id);
  }

  return {
    clubsProcessed,
    clubsSkipped,
    citiesCreated,
    clubsCreated,
    courtsCreated,
  };
}

async function main(): Promise<void> {
  const files = await fs.promises.readdir(JSON_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  console.log(`[load-playtomic] Found ${jsonFiles.length} JSON files in ${JSON_DIR}`);

  let totalClubs = 0;
  let totalSkipped = 0;
  let totalCities = 0;
  let totalClubsCreated = 0;
  let totalCourts = 0;

  for (const file of jsonFiles.sort()) {
    const filePath = path.join(JSON_DIR, file);
    try {
      console.log(`[load-playtomic] Loading ${file} ...`);
      const stats = await loadFile(filePath);
      totalClubs += stats.clubsProcessed;
      totalSkipped += stats.clubsSkipped;
      totalCities += stats.citiesCreated;
      totalClubsCreated += stats.clubsCreated;
      totalCourts += stats.courtsCreated;
      console.log(
        `[load-playtomic] ${file} -> clubs: ${stats.clubsProcessed}, skipped: ${stats.clubsSkipped}, citiesCreated: ${stats.citiesCreated}, clubsCreated: ${stats.clubsCreated}, courtsCreated: ${stats.courtsCreated}`
      );
    } catch (err) {
      console.error(`[load-playtomic] Error loading ${file}:`, err);
    }
  }

  const { refreshAllCitiesFromClubs } = await import('../src/utils/updateCityCenter');
  const citiesUpdated = await refreshAllCitiesFromClubs();
  console.log(
    `[load-playtomic] Done. clubsProcessed: ${totalClubs}, skipped: ${totalSkipped}, citiesCreated: ${totalCities}, clubsCreated: ${totalClubsCreated}, courtsCreated: ${totalCourts}, citiesRefreshed: ${citiesUpdated}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
