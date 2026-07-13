/**
 * Seed or update Avantura Padel clubs for Padeloo integration.
 *
 * Usage:
 *   cd Backend && npx ts-node -r dotenv/config scripts/seed-padeloo-avantura.ts
 *   CITY_NAME=Zlatibor npx ts-node -r dotenv/config scripts/seed-padeloo-avantura.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { ClubIntegrationType, Prisma } from '@prisma/client';
import prisma from '../src/config/database';

const AVANTURA_CLUBS = [
  {
    padelooClubId: 2,
    name: 'Avantura Padel',
    address: 'Miladina Pećinara bb (Avantura Park)',
    courts: [{ externalCourtId: '5', name: 'Teren 1', integrationCourtName: 'Teren 1' }],
  },
  {
    padelooClubId: 3,
    name: 'Avantura Padel 2',
    address: 'Ulica Sportova bb (TRK)',
    courts: [
      { externalCourtId: '6', name: 'Teren 1', integrationCourtName: 'Teren 1' },
      { externalCourtId: '7', name: 'Teren 2', integrationCourtName: 'Teren 2' },
    ],
  },
] as const;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

async function main(): Promise<void> {
  const cityName = process.env.CITY_NAME?.trim() || 'Zlatibor';
  const city = await prisma.city.findFirst({
    where: { name: { equals: cityName, mode: 'insensitive' } },
  });
  if (!city) {
    throw new Error(`City "${cityName}" not found — create it first or set CITY_NAME`);
  }

  for (const spec of AVANTURA_CLUBS) {
    const normalizedName = normalizeName(spec.name);
    const integrationConfig = { clubId: spec.padelooClubId } satisfies Prisma.InputJsonValue;

    let club = await prisma.club.findFirst({
      where: {
        cityId: city.id,
        normalizedName,
      },
    });

    if (club) {
      club = await prisma.club.update({
        where: { id: club.id },
        data: {
          integrationType: ClubIntegrationType.PADELOO,
          integrationConfig,
          address: spec.address,
          courtsNumber: spec.courts.length,
          isActive: true,
          isForPlaying: true,
        },
      });
      console.log(`Updated club ${club.name} (${club.id})`);
    } else {
      club = await prisma.club.create({
        data: {
          name: spec.name,
          normalizedName,
          address: spec.address,
          cityId: city.id,
          integrationType: ClubIntegrationType.PADELOO,
          integrationConfig,
          courtsNumber: spec.courts.length,
          isActive: true,
          isForPlaying: true,
        },
      });
      console.log(`Created club ${club.name} (${club.id})`);
    }

    for (const courtSpec of spec.courts) {
      const existing = await prisma.court.findFirst({
        where: { clubId: club.id, externalCourtId: courtSpec.externalCourtId },
      });
      if (existing) {
        await prisma.court.update({
          where: { id: existing.id },
          data: {
            name: courtSpec.name,
            integrationCourtName: courtSpec.integrationCourtName,
            isActive: true,
          },
        });
      } else {
        await prisma.court.create({
          data: {
            name: courtSpec.name,
            clubId: club.id,
            externalCourtId: courtSpec.externalCourtId,
            integrationCourtName: courtSpec.integrationCourtName,
            isIndoor: false,
            isActive: true,
          },
        });
      }
    }
  }

  console.log('Padeloo Avantura seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
