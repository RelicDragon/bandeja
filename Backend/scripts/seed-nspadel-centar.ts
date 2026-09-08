/**
 * Seed or update NS PADEL CENTAR (Novi Sad) for the NSPADELSUPABASE integration.
 *
 * Club facts verified live 2026-09-08 (nspadel.rs): name, address
 * (Novosadski put 138, Novi Sad), hours Mon–Sun 08:00–23:00, phone
 * +381653681911, email nspadelcentar@gmail.com, site https://nspadel.rs,
 * Instagram instagram.com/nspadelcentar, widget params (Singles 1v1 /
 * Doubles 2v2; 60/90/120 min).
 *
 * Upstream integration verified live 2026-09-08 against the club's public
 * Supabase PostgREST API: project URL below, `courts` rows (Singles teren +
 * Doubles teren, 08:00–23:00, 30-min grid, 60/90/120 min), the
 * `get_occupied_slots` RPC, and public `reservations` insert. These are the
 * seed defaults and can still be overridden via env:
 *   NS_PADEL_SUPABASE_URL=https://xyzcompany.supabase.co
 *   NS_PADEL_COURTS_JSON='[{"externalCourtId":"<uuid>","name":"Teren 1"}]'
 * Until a Supabase URL is configured, booking answers with the
 * nspadelSupabaseUrlRequired error key.
 *
 * This seed is idempotent and deploy-safe (missing city ⇒ skip with exit 0),
 * and runs from scripts/deploy-backend.sh so fresh dev/prod deploys get the
 * club row via the normal deploy path.
 *
 * Usage:
 *   cd Backend && npx ts-node -r dotenv/config scripts/seed-nspadel-centar.ts
 *   CITY_NAME="Novi Sad" NS_PADEL_SUPABASE_URL=https://xyz.supabase.co \
 *     NS_PADEL_COURTS_JSON='[{"externalCourtId":"1","name":"Teren 1"}]' \
 *     npx ts-node -r dotenv/config scripts/seed-nspadel-centar.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { ClubIntegrationType, Prisma, Sport } from '@prisma/client';
import prisma from '../src/config/database';
import { ImageProcessor } from '../src/utils/imageProcessor';

const CLUB_NAME = 'NS PADEL CENTAR Novi Sad';

const LOGO_PATH =
  process.env.NS_PADEL_LOGO_PATH ||
  path.join(__dirname, '..', '..', 'Frontend', 'public', 'assets', 'clubs', 'ns-padel-centar.png');

type CourtSpec = {
  externalCourtId: string;
  name: string;
  integrationCourtName?: string;
  pricePerHour?: number;
  courtType?: string;
  isIndoor?: boolean;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function parseCourtsEnv(raw: string | undefined): CourtSpec[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log('NOTE: NS_PADEL_COURTS_JSON is not valid JSON — skipping courts.');
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.log('NOTE: NS_PADEL_COURTS_JSON must be a JSON array — skipping courts.');
    return [];
  }
  const courts: CourtSpec[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const externalCourtId =
      typeof record.externalCourtId === 'string' ? record.externalCourtId.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!externalCourtId || !name) continue;
    const spec: CourtSpec = { externalCourtId, name };
    if (typeof record.integrationCourtName === 'string' && record.integrationCourtName.trim()) {
      spec.integrationCourtName = record.integrationCourtName.trim();
    }
    if (typeof record.pricePerHour === 'number' && Number.isFinite(record.pricePerHour)) {
      spec.pricePerHour = record.pricePerHour;
    }
    if (typeof record.courtType === 'string' && record.courtType.trim()) {
      spec.courtType = record.courtType.trim();
    }
    if (typeof record.isIndoor === 'boolean') spec.isIndoor = record.isIndoor;
    courts.push(spec);
  }
  return courts;
}

async function main(): Promise<void> {
  const cityName = process.env.CITY_NAME?.trim() || 'Novi Sad';
  const city = await prisma.city.findFirst({
    where: { name: { equals: cityName, mode: 'insensitive' } },
  });
  if (!city) {
    console.log(`SKIP: city "${cityName}" not found — NS Padel Centar seed deferred (exit 0).`);
    return;
  }

  const supabaseUrl = (
    process.env.NS_PADEL_SUPABASE_URL?.trim().replace(/\/+$/, '') ||
    'https://dkqbjxftvbijvkwoqaea.supabase.co'
  );
  // Never wipe a previously configured URL: only overwrite integrationConfig
  // when the env var is provided, otherwise keep the stored value.
  const integrationConfig = (
    supabaseUrl ? { supabaseUrl } : undefined
  ) satisfies Prisma.InputJsonValue | undefined;

  const data = {
    name: CLUB_NAME,
    normalizedName: normalizeName(CLUB_NAME),
    description: 'NS PADEL CENTAR Novi Sad. Instagram: instagram.com/nspadelcentar',
    address: 'Novosadski put 138, Novi Sad',
    cityId: city.id,
    phone: '+381653681911',
    email: 'nspadelcentar@gmail.com',
    website: 'https://nspadel.rs',
    openingTime: '08:00',
    closingTime: '23:00',
    sports: [Sport.PADEL],
    defaultSlotMinutes: 60,
    integrationType: ClubIntegrationType.NSPADELSUPABASE,
    ...(integrationConfig !== undefined ? { integrationConfig } : {}),
    policyText:
      'Open Mon–Sun 08:00–23:00. Booking via the club widget (Singles 1v1 / Doubles 2v2; 60/90/120 min). ' +
      'Prices in RSD per the club Cenovnik price list.',
    isActive: true,
    isForPlaying: true,
  };

  const existing = await prisma.club.findFirst({
    where: { cityId: city.id, normalizedName: normalizeName(CLUB_NAME) },
  });

  const club =
    existing ?
      await prisma.club.update({
        where: { id: existing.id },
        data: { ...data, courtsNumber: existing.courtsNumber },
      })
    : await prisma.club.create({
        data: { ...data, integrationConfig: integrationConfig ?? Prisma.DbNull, courtsNumber: 0 },
      });
  console.log(`${existing ? 'Updated' : 'Created'} club ${club.name} (${club.id})`);

  const courtSpecs = parseCourtsEnv(
    process.env.NS_PADEL_COURTS_JSON ??
      JSON.stringify([
        {
          externalCourtId: 'a91de04e-7a01-46bb-96c2-f686f570f417',
          name: 'Singles teren',
          integrationCourtName: 'Singles teren',
          courtType: 'singles',
          isIndoor: false,
        },
        {
          externalCourtId: '304f56ee-cfca-48e4-9c95-0ff68fb4c19a',
          name: 'Doubles teren',
          integrationCourtName: 'Doubles teren',
          courtType: 'doubles',
          isIndoor: false,
        },
      ]),
  );
  if (courtSpecs.length > 0) {
    for (const courtSpec of courtSpecs) {
      const found = await prisma.court.findFirst({
        where: { clubId: club.id, externalCourtId: courtSpec.externalCourtId },
      });
      const courtData = {
        name: courtSpec.name,
        integrationCourtName: courtSpec.integrationCourtName ?? courtSpec.name,
        pricePerHour: courtSpec.pricePerHour ?? null,
        courtType: courtSpec.courtType ?? null,
        isIndoor: courtSpec.isIndoor ?? false,
        sport: Sport.PADEL,
        isActive: true,
      };
      if (found) {
        await prisma.court.update({ where: { id: found.id }, data: courtData });
        console.log(`Updated court ${courtSpec.name}`);
      } else {
        await prisma.court.create({
          data: { ...courtData, clubId: club.id, externalCourtId: courtSpec.externalCourtId },
        });
        console.log(`Created court ${courtSpec.name}`);
      }
    }
  } else {
    console.log(
      'NOTE: NS_PADEL_COURTS_JSON not set — court list unverified upstream, creating no Court rows.',
    );
  }
  const activeCount = await prisma.court.count({
    where: { clubId: club.id, isActive: true },
  });
  await prisma.club.update({ where: { id: club.id }, data: { courtsNumber: activeCount } });
  console.log(`courtsNumber → ${activeCount}`);

  const withAvatar = await prisma.club.findUnique({
    where: { id: club.id },
    select: { avatar: true },
  });
  if (fs.existsSync(LOGO_PATH) && !withAvatar?.avatar) {
    try {
      const buf = fs.readFileSync(LOGO_PATH);
      const processed = await ImageProcessor.processAvatar(buf, 'ns-padel-centar-logo.png');
      await prisma.club.update({
        where: { id: club.id },
        data: { avatar: processed.avatarPath, originalAvatar: processed.originalPath },
      });
      console.log(`Uploaded logo → ${processed.avatarPath}`);
    } catch (err) {
      // Deploy-safe: a logo upload failure (e.g. S3 unconfigured) must not
      // fail the deploy; the club row above is already committed.
      console.log(`NOTE: logo upload skipped (${(err as Error)?.message ?? err})`);
    }
  } else if (withAvatar?.avatar) {
    console.log(`Logo already set: ${withAvatar.avatar}`);
  } else {
    console.log(`No logo at ${LOGO_PATH}; skip upload`);
  }

  if (!process.env.NS_PADEL_SUPABASE_URL?.trim()) {
    console.log(`Using verified default Supabase URL ${supabaseUrl} (override with NS_PADEL_SUPABASE_URL).`);
  }
  console.log('NS Padel Centar seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
