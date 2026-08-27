/**
 * Upsert Asia metro cities used by soft-launch markets.
 * IDs must match Frontend/public/geo/cities.json keys.
 *
 * Usage: npm run seed:asia-cities
 */
import prisma from '../src/config/database';
import seed from './asia-cities-seed-data.json';

type AsiaCitySeed = {
  id: string;
  name: string;
  country: string;
  timezone: string;
  native?: string;
  latitude?: number;
  longitude?: number;
  telegramPinnedLanguage?: string;
};

async function main() {
  for (const row of seed as AsiaCitySeed[]) {
    const data = {
      name: row.name,
      country: row.country,
      timezone: row.timezone,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      telegramPinnedLanguage: row.telegramPinnedLanguage ?? 'en-GB',
      isActive: true,
      isCorrect: true,
    };
    await prisma.city.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        ...data,
      },
      update: data,
    });
    console.log('upserted', row.id, row.name, data.telegramPinnedLanguage);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
