/**
 * Import Klikteren racket venues into Bandeja (leave BOOKTIME clubs alone).
 *
 *   cd Backend && DB_URL=… DB_SCHEMA=padelpulse npx ts-node -r dotenv/config scripts/seed-klikteren-venues.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { ClubIntegrationType, Sport, Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { ImageProcessor } from '../src/utils/imageProcessor';
import { normalizeClubName } from '../src/utils/normalizeClubName';
import { refreshCityFromClubs } from '../src/utils/updateCityCenter';

const DRY_RUN = process.env.DRY_RUN === '1';
const LOGO_DIR = '/tmp/klikteren-logos';
const LOGO_CDN =
  'https://facyuetxuwnllbqybrgu.supabase.co/storage/v1/object/public/venue-images/';

const SPORT_MAP: Record<string, Sport> = {
  padel: Sport.PADEL,
  tennis: Sport.TENNIS,
  pickleball: Sport.PICKLEBALL,
  squash: Sport.SQUASH,
};

type CourtSpec = {
  name: string;
  externalCourtId: string;
  sport: Sport;
  isIndoor: boolean;
  pricePerHour: number | null;
};

type VenueSpec = {
  venueId: string;
  name: string;
  cityName: string;
  address: string;
  phone: string | null;
  website: string;
  latitude: number;
  longitude: number;
  description?: string | null;
  openingTime?: string | null;
  closingTime?: string | null;
  logoPath?: string | null;
  matchClubId?: string;
  courts: CourtSpec[];
};

function isIndoorName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('unutra') || n.includes('balon') || n.includes('indoor');
}

function hoursFromVenue(v: Record<string, unknown>): { open: string | null; close: string | null } {
  const oh = v.operating_hours as Record<string, { start?: string; end?: string } | Array<{ start?: string; end?: string }>> | undefined;
  const mon = oh?.monday;
  const slot = Array.isArray(mon) ? mon[0] : mon;
  return { open: slot?.start ?? null, close: slot?.end ?? null };
}

function buildSpecs(rawById: Record<string, Record<string, unknown>>): VenueSpec[] {
  const specs: Array<{
    venueId: string;
    name: string;
    cityName: string;
    matchClubId?: string;
  }> = [
    { venueId: '3409bb25-b7ae-4c46-baec-2ecba69af4e2', name: 'Padel Arena', cityName: 'Novi Sad', matchClubId: 'cml3ue39k07na653h7sab9a5n' },
    { venueId: '8ebb561b-016b-4b04-bb19-fed2500c767a', name: 'Padel Tenis Spin', cityName: 'Novi Sad' },
    { venueId: 'ca3c91e2-3702-4394-ad4c-d4be3e1036bf', name: 'Petlov Salaš', cityName: 'Novi Sad' },
    { venueId: 'b7b073de-e539-4b67-8652-8a995e7bf932', name: 'Pickleball Kuhinja', cityName: 'Novi Sad' },
    { venueId: 'b2c12a8d-8627-482e-8be6-69e5364a671a', name: 'Sportland', cityName: 'Novi Sad', matchClubId: 'cmqkz2n8m000qzksbb64iou76' },
    { venueId: 'dc242703-1f73-4190-b31e-82764c2735c0', name: 'Sportski Centar Albatros', cityName: 'Novi Sad' },
    { venueId: '13500d65-11a8-4823-a917-388bbd581b89', name: 'Squash Club Adut', cityName: 'Novi Sad', matchClubId: 'cmqp95f5p0005f0652672edjm' },
    { venueId: '2488a7bf-1ea4-4692-aea4-a2b886d2ad50', name: 'Padel Inđija', cityName: 'Inđija' },
    { venueId: 'f3596349-9428-4177-92f1-98c9dc728a55', name: 'Teniski teren Inđija', cityName: 'Inđija' },
  ];

  return specs.map((meta) => {
    const v = rawById[meta.venueId];
    if (!v) throw new Error(`Missing venue payload ${meta.venueId}`);
    const { open, close } = hoursFromVenue(v);
    const courtsRaw = (v.courts as Array<Record<string, unknown>>) || [];
    const courts: CourtSpec[] = [];
    for (const c of courtsRaw) {
      const sportKey = String(c.sport_type || '').toLowerCase();
      const sport = SPORT_MAP[sportKey];
      if (!sport) continue;
      const name = String(c.name || '');
      const price = typeof c.price_per_hour === 'number' ? c.price_per_hour : null;
      courts.push({
        name,
        externalCourtId: String(c.id),
        sport,
        isIndoor: isIndoorName(name),
        pricePerHour: price != null && price > 0 ? price : null,
      });
    }
    if (courts.length === 0) throw new Error(`No racket courts for ${meta.name}`);
    return {
      venueId: meta.venueId,
      name: meta.name,
      cityName: meta.cityName,
      address: String(v.address || ''),
      phone: v.contact_phone ? String(v.contact_phone) : null,
      website: `https://klikteren.com/objekti/${v.slug || meta.venueId}`,
      latitude: Number(v.latitude),
      longitude: Number(v.longitude),
      description: v.description ? String(v.description) : null,
      openingTime: open,
      closingTime: close,
      logoPath: v.logo_image_path ? String(v.logo_image_path) : null,
      matchClubId: meta.matchClubId,
      courts,
    };
  });
}

async function ensureCity(cityName: string): Promise<string> {
  const existing = await prisma.city.findFirst({
    where: { name: { equals: cityName, mode: 'insensitive' } },
  });
  if (existing) return existing.id;
  if (DRY_RUN) {
    console.log(`Would create city ${cityName}`);
    return 'dry-run-city';
  }
  if (cityName === 'Inđija') {
    const city = await prisma.city.create({
      data: {
        name: 'Inđija',
        country: 'Serbia',
        timezone: 'Europe/Belgrade',
        administrativeArea: 'Vojvodina',
        subAdministrativeArea: 'Srem',
        latitude: 45.0478559,
        longitude: 20.0807338,
        isActive: true,
        isCorrect: true,
      },
    });
    console.log(`Created city ${city.name} (${city.id})`);
    return city.id;
  }
  throw new Error(`City not found: ${cityName}`);
}

async function downloadLogo(logoPath: string, venueId: string): Promise<string | null> {
  const url = `${LOGO_CDN}${logoPath}`;
  fs.mkdirSync(LOGO_DIR, { recursive: true });
  const dest = path.join(LOGO_DIR, `${venueId}.jpg`);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // sharp via ImageProcessor expects image bytes; store webp/jpg as-is
    fs.writeFileSync(dest, buf);
    return dest;
  } catch {
    return null;
  }
}

async function upsertVenue(spec: VenueSpec, cityId: string): Promise<void> {
  const normalizedName = normalizeClubName(spec.name);
  const sports = [...new Set(spec.courts.map((c) => c.sport))];

  let club = spec.matchClubId
    ? await prisma.club.findUnique({ where: { id: spec.matchClubId } })
    : null;
  if (!club) {
    club = await prisma.club.findFirst({
      where: { cityId, normalizedName },
    });
  }
  if (club?.integrationType === ClubIntegrationType.BOOKTIME) {
    console.log(`SKIP BOOKTIME ${club.name}`);
    return;
  }

  const data = {
    name: club?.name === 'TK Sportland' ? club.name : spec.name,
    address: spec.address || club?.address || '',
    phone: spec.phone,
    website: spec.website,
    latitude: spec.latitude,
    longitude: spec.longitude,
    description: spec.description,
    openingTime: spec.openingTime ?? undefined,
    closingTime: spec.closingTime ?? undefined,
    sports,
    courtsNumber: spec.courts.length,
    isActive: true,
    isForPlaying: true,
    isBar: false,
    integrationType: ClubIntegrationType.KLIKTEREN,
    integrationConfig: { venueId: spec.venueId } satisfies Prisma.InputJsonValue,
  };

  if (DRY_RUN) {
    console.log(club ? `Would update ${club.id}` : `Would create`, spec.name, sports, spec.courts.length);
    return;
  }

  if (club) {
    club = await prisma.club.update({ where: { id: club.id }, data });
    console.log(`Updated ${club.name} (${club.id}) → KLIKTEREN`);
  } else {
    club = await prisma.club.create({
      data: {
        ...data,
        cityId,
        normalizedName,
      },
    });
    console.log(`Created ${club.name} (${club.id})`);
  }

  for (const court of spec.courts) {
    const existing = await prisma.court.findFirst({
      where: {
        clubId: club.id,
        OR: [{ externalCourtId: court.externalCourtId }, { name: court.name }],
      },
    });
    const courtData = {
      name: court.name,
      sport: court.sport,
      isIndoor: court.isIndoor,
      pricePerHour: court.pricePerHour ?? undefined,
      externalCourtId: court.externalCourtId,
      integrationCourtName: court.name,
      isActive: true,
    };
    if (existing) {
      await prisma.court.update({ where: { id: existing.id }, data: courtData });
    } else {
      await prisma.court.create({ data: { ...courtData, clubId: club.id } });
    }
  }

  // Deactivate old placeholder courts when rewiring an existing club to Klikteren.
  if (spec.matchClubId) {
    const keep = new Set(spec.courts.map((c) => c.externalCourtId));
    const others = await prisma.court.findMany({
      where: { clubId: club.id, isActive: true },
      select: { id: true, name: true, externalCourtId: true },
    });
    for (const row of others) {
      if (row.externalCourtId && keep.has(row.externalCourtId)) continue;
      await prisma.court.update({
        where: { id: row.id },
        data: { isActive: false, externalCourtId: null, integrationCourtName: null },
      });
      console.log(`  deactivated stale court ${row.name}`);
    }
    const activeCount = await prisma.court.count({ where: { clubId: club.id, isActive: true } });
    await prisma.club.update({
      where: { id: club.id },
      data: { courtsNumber: activeCount },
    });
  }

  if (!club.avatar && spec.logoPath) {
    const file = await downloadLogo(spec.logoPath, spec.venueId);
    if (file) {
      const buf = fs.readFileSync(file);
      const processed = await ImageProcessor.processAvatar(buf, path.basename(file));
      await prisma.club.update({
        where: { id: club.id },
        data: { avatar: processed.avatarPath, originalAvatar: processed.originalPath },
      });
      console.log(`  logo → ${processed.avatarPath}`);
    }
  }
}

async function main(): Promise<void> {
  const raw = JSON.parse(fs.readFileSync('/tmp/klikteren-import-venues.json', 'utf8')) as Record<
    string,
    Record<string, unknown>
  >;
  const specs = buildSpecs(raw);
  const cityIds = new Map<string, string>();

  for (const spec of specs) {
    if (!cityIds.has(spec.cityName)) {
      cityIds.set(spec.cityName, await ensureCity(spec.cityName));
    }
    await upsertVenue(spec, cityIds.get(spec.cityName)!);
  }

  if (!DRY_RUN) {
    for (const cityId of cityIds.values()) {
      if (cityId !== 'dry-run-city') await refreshCityFromClubs(cityId);
    }
  }
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
