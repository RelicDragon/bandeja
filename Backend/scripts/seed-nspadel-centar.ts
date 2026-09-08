/**
 * Seed or update NS PADEL CENTAR (Novi Sad) for the NSPADELSUPABASE integration.
 *
 * Club facts verified live 2026-09-08 (nspadel.rs). NOT verified and therefore
 * NOT seeded here: Supabase project URL / RPC names / court list — set
 * NS_PADEL_SUPABASE_URL once observed in the club JS bundle, and add courts
 * once their identifiers are observed. Courts/pricing are never invented.
 *
 * Usage:
 *   cd Backend && npx ts-node -r dotenv/config scripts/seed-nspadel-centar.ts
 *   CITY_NAME="Novi Sad" NS_PADEL_SUPABASE_URL=https://xyz.supabase.co npx ts-node -r dotenv/config scripts/seed-nspadel-centar.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { ClubIntegrationType, Prisma } from '@prisma/client';
import prisma from '../src/config/database';

const CLUB_NAME = 'NS PADEL CENTAR Novi Sad';

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

async function main(): Promise<void> {
  const cityName = process.env.CITY_NAME?.trim() || 'Novi Sad';
  const city = await prisma.city.findFirst({
    where: { name: { equals: cityName, mode: 'insensitive' } },
  });
  if (!city) {
    throw new Error(`City "${cityName}" not found — create it first or set CITY_NAME`);
  }

  const supabaseUrl = process.env.NS_PADEL_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const integrationConfig = (
    supabaseUrl ? { supabaseUrl } : Prisma.DbNull
  ) satisfies Prisma.InputJsonValue;

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
    integrationType: ClubIntegrationType.NSPADELSUPABASE,
    integrationConfig,
    policyText:
      'Open Mon–Sun 08:00–23:00. Booking via the club widget (Singles 1v1 / Doubles 2v2; 60/90/120 min). ' +
      'Prices in RSD per the club Cenovnik price list.',
    courtsNumber: 0,
    isActive: true,
    isForPlaying: true,
  };

  const existing = await prisma.club.findFirst({
    where: { cityId: city.id, normalizedName: normalizeName(CLUB_NAME) },
  });

  if (existing) {
    const club = await prisma.club.update({ where: { id: existing.id }, data });
    console.log(`Updated club ${club.name} (${club.id})`);
  } else {
    const club = await prisma.club.create({ data });
    console.log(`Created club ${club.name} (${club.id})`);
  }

  if (!supabaseUrl) {
    console.log(
      'NOTE: NS_PADEL_SUPABASE_URL not set — club seeded without integrationConfig. ' +
        'Upstream proxy will return "Club not configured" until the URL is observed and set.',
    );
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
