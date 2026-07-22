/**
 * Upsert Padel Pro (Novi Sad) + outdoor courts + KLIKTEREN integration.
 *
 *   cd Backend && npx ts-node -r dotenv/config scripts/seed-padel-pro-novi-sad.ts
 *   DB_URL=postgresql://… DB_SCHEMA=padelpulse npx ts-node -r dotenv/config scripts/seed-padel-pro-novi-sad.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import { ClubIntegrationType, Sport } from '@prisma/client';
import prisma from '../src/config/database';
import { ImageProcessor } from '../src/utils/imageProcessor';
import { normalizeClubName } from '../src/utils/normalizeClubName';
import { refreshCityFromClubs } from '../src/utils/updateCityCenter';

const CITY_NAME = 'Novi Sad';
const LOGO_PATH = process.env.LOGO_PATH || '/tmp/padel-pro/logo.jpg';
const DRY_RUN = process.env.DRY_RUN === '1';
const KLIKTEREN_VENUE_ID = '05cdc4d3-03fd-4f2c-af65-9b2018b5a53e';

const CLUB = {
  name: 'Padel Pro',
  address: 'Heroja sa Košara 89, Adice, 21203 Novi Sad, Serbia',
  latitude: 45.2320904228781,
  longitude: 19.7645423092366,
  phone: '+38163474570',
  website: 'https://klikteren.com/objekti/padel-pro',
  description: '2 Padel terena u Novom Sadu! Grupni i individualni treninzi',
  openingTime: '08:00',
  closingTime: '22:00',
  amenities: ['parking', 'cafe', 'changing_rooms', 'wifi', 'equipment_rental', 'lockers'],
};

const COURTS = [
  {
    name: 'Padel - 1 (Napolju - levo)',
    isIndoor: false,
    pricePerHour: 2700,
    externalCourtId: 'c018734c-865d-412f-a3da-ad5f4cfdeecc',
  },
  {
    name: 'Padel - 2 (Napolju - desno)',
    isIndoor: false,
    pricePerHour: 2700,
    externalCourtId: '8a500ac3-22ef-4fdf-8330-dfe1d43473c9',
  },
] as const;

async function main(): Promise<void> {
  const city = await prisma.city.findFirst({
    where: { name: { equals: CITY_NAME, mode: 'insensitive' } },
  });
  if (!city) throw new Error(`City "${CITY_NAME}" not found`);

  const normalizedName = normalizeClubName(CLUB.name);
  let club = await prisma.club.findFirst({
    where: { cityId: city.id, normalizedName },
  });

  if (DRY_RUN) {
    console.log(club ? `Would update ${club.id}` : 'Would create club', CLUB, COURTS);
    return;
  }

  const integrationData = {
    integrationType: ClubIntegrationType.KLIKTEREN,
    integrationConfig: { venueId: KLIKTEREN_VENUE_ID },
  };

  if (club) {
    club = await prisma.club.update({
      where: { id: club.id },
      data: {
        name: CLUB.name,
        address: CLUB.address,
        latitude: CLUB.latitude,
        longitude: CLUB.longitude,
        phone: CLUB.phone,
        website: CLUB.website,
        description: CLUB.description,
        openingTime: CLUB.openingTime,
        closingTime: CLUB.closingTime,
        amenities: CLUB.amenities,
        sports: [Sport.PADEL],
        courtsNumber: COURTS.length,
        isActive: true,
        isForPlaying: true,
        isBar: false,
        ...integrationData,
      },
    });
    console.log(`Updated club ${club.name} (${club.id})`);
  } else {
    club = await prisma.club.create({
      data: {
        name: CLUB.name,
        normalizedName,
        address: CLUB.address,
        cityId: city.id,
        latitude: CLUB.latitude,
        longitude: CLUB.longitude,
        phone: CLUB.phone,
        website: CLUB.website,
        description: CLUB.description,
        openingTime: CLUB.openingTime,
        closingTime: CLUB.closingTime,
        amenities: CLUB.amenities,
        sports: [Sport.PADEL],
        courtsNumber: COURTS.length,
        isActive: true,
        isForPlaying: true,
        isBar: false,
        ...integrationData,
      },
    });
    console.log(`Created club ${club.name} (${club.id})`);
  }

  for (const courtSpec of COURTS) {
    const existing = await prisma.court.findFirst({
      where: {
        clubId: club.id,
        OR: [{ name: courtSpec.name }, { externalCourtId: courtSpec.externalCourtId }],
      },
    });
    if (existing) {
      await prisma.court.update({
        where: { id: existing.id },
        data: {
          name: courtSpec.name,
          sport: Sport.PADEL,
          isIndoor: courtSpec.isIndoor,
          pricePerHour: courtSpec.pricePerHour,
          externalCourtId: courtSpec.externalCourtId,
          integrationCourtName: courtSpec.name,
          isActive: true,
        },
      });
      console.log(`Updated court ${courtSpec.name}`);
    } else {
      await prisma.court.create({
        data: {
          name: courtSpec.name,
          clubId: club.id,
          sport: Sport.PADEL,
          isIndoor: courtSpec.isIndoor,
          pricePerHour: courtSpec.pricePerHour,
          externalCourtId: courtSpec.externalCourtId,
          integrationCourtName: courtSpec.name,
          isActive: true,
        },
      });
      console.log(`Created court ${courtSpec.name}`);
    }
  }

  if (fs.existsSync(LOGO_PATH) && !club.avatar) {
    const buf = fs.readFileSync(LOGO_PATH);
    const processed = await ImageProcessor.processAvatar(buf, 'padel-pro-logo.jpg');
    club = await prisma.club.update({
      where: { id: club.id },
      data: {
        avatar: processed.avatarPath,
        originalAvatar: processed.originalPath,
      },
    });
    console.log(`Uploaded logo → ${processed.avatarPath}`);
  } else if (club.avatar) {
    console.log(`Logo already set: ${club.avatar}`);
  } else {
    console.log(`No logo at ${LOGO_PATH}; skip upload`);
  }

  await refreshCityFromClubs(city.id);
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
