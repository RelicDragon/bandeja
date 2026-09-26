/**
 * Two local padel games with a full roster, ready to be played (`participantsReady`),
 * `status: ANNOUNCED`, `resultsStatus: NONE` — nothing started, nothing scored.
 *
 * 1. "Ready to play — Best of 3": CLASSIC / CLASSIC_BEST_OF_3, 4 players (2v2).
 * 2. "Ready to play — Americano": AMERICANO / POINTS_24, 8 players (2 courts' worth).
 *
 * Owner + player on both: VIEWER_EMAIL (default relic.serbia@gmail.com). The rest of
 * the roster is filled from other users in the owner's city.
 *
 * Idempotent: re-running deletes and recreates both games. `--clean` removes them and exits.
 *
 *   cd Backend
 *   npx ts-node --transpile-only -r dotenv/config scripts/seed-ready-to-play-games.ts
 *   npx ts-node --transpile-only -r dotenv/config scripts/seed-ready-to-play-games.ts --clean
 *
 * Dev only. Writes straight to the tables and skips the game service, so there is no
 * chat, no system message and no follower push.
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

const VIEWER_EMAIL = process.env.VIEWER_EMAIL ?? 'relic.serbia@gmail.com';
const CLASSIC_NAME = 'Ready to play — Best of 3';
const AMERICANO_NAME = 'Ready to play — Americano';

async function clean(): Promise<number> {
  const { count } = await prisma.game.deleteMany({
    where: { name: { in: [CLASSIC_NAME, AMERICANO_NAME] } },
  });
  return count;
}

async function main(): Promise<void> {
  const removed = await clean();
  console.log(`removed ${removed} existing game(s)`);
  if (process.argv.includes('--clean')) return;

  const viewer = await prisma.user.findUnique({
    where: { email: VIEWER_EMAIL },
    select: { id: true, currentCityId: true },
  });
  if (!viewer?.currentCityId) throw new Error(`${VIEWER_EMAIL} not found or has no city`);
  const cityId = viewer.currentCityId;

  const club = await prisma.club.findFirst({
    where: { cityId, courts: { some: {} } },
    orderBy: { courts: { _count: 'desc' } },
    select: { id: true, name: true, courts: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' }, take: 2 } },
  });
  if (!club) throw new Error('no club with courts in the viewer city');
  const [classicCourt, americanoCourt] = [club.courts[0], club.courts[1] ?? club.courts[0]];

  const others = await prisma.user.findMany({
    where: {
      currentCityId: cityId,
      id: { not: viewer.id },
      firstName: { not: null },
      lastName: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, firstName: true, lastName: true },
  });
  if (others.length < 7) throw new Error('need at least 7 other players in the viewer city');

  const now = Date.now();
  const name = (p: (typeof others)[number]) => `${p.firstName} ${p.lastName}`;

  // Game 1 — CLASSIC, best of 3, 2v2.
  const classicOthers = others.slice(0, 3);
  const classicStart = new Date(now + 2 * 60 * 60 * 1000);
  const classicGame = await prisma.game.create({
    data: {
      entityType: 'GAME',
      gameType: 'CLASSIC',
      sport: 'PADEL',
      scoringPreset: 'CLASSIC_BEST_OF_3',
      scoringMode: 'CLASSIC',
      fixedNumberOfSets: 3,
      matchGenerationType: 'AUTOMATIC',
      name: CLASSIC_NAME,
      cityId,
      clubId: club.id,
      courtId: classicCourt.id,
      startTime: classicStart,
      endTime: new Date(classicStart.getTime() + 90 * 60 * 1000),
      timeIsSet: true,
      maxParticipants: 4,
      playersPerMatch: 4,
      minLevel: 1,
      maxLevel: 7,
      isPublic: true,
      affectsRating: true,
      status: 'ANNOUNCED',
      resultsStatus: 'NONE',
      participantsReady: true,
      participants: {
        create: [
          { userId: viewer.id, role: 'OWNER', status: 'PLAYING', joinedAt: new Date(now) },
          ...classicOthers.map((p) => ({
            userId: p.id,
            role: 'PARTICIPANT' as const,
            status: 'PLAYING' as const,
            joinedAt: new Date(now),
          })),
        ],
      },
    },
    select: { id: true },
  });
  console.log(`${CLASSIC_NAME} · ${club.name} · ${classicCourt.name}`);
  console.log(`  players: you, ${classicOthers.map(name).join(', ')}`);
  console.log(`  /games/${classicGame.id}`);

  // Game 2 — AMERICANO, 8 players, 2 courts' worth of rotation.
  const americanoOthers = others.slice(3, 10);
  const americanoStart = new Date(now + 26 * 60 * 60 * 1000);
  const americanoGame = await prisma.game.create({
    data: {
      entityType: 'GAME',
      gameType: 'AMERICANO',
      sport: 'PADEL',
      scoringPreset: 'POINTS_24',
      scoringMode: 'POINTS',
      fixedNumberOfSets: 1,
      maxTotalPointsPerSet: 24,
      matchGenerationType: 'RANDOM',
      matchTimerEnabled: true,
      matchTimedCapMinutes: 15,
      name: AMERICANO_NAME,
      cityId,
      clubId: club.id,
      courtId: americanoCourt.id,
      startTime: americanoStart,
      endTime: new Date(americanoStart.getTime() + 2 * 60 * 60 * 1000),
      timeIsSet: true,
      maxParticipants: 8,
      playersPerMatch: 4,
      minParticipants: 4,
      minLevel: 1,
      maxLevel: 7,
      isPublic: true,
      affectsRating: false,
      status: 'ANNOUNCED',
      resultsStatus: 'NONE',
      participantsReady: true,
      participants: {
        create: [
          { userId: viewer.id, role: 'OWNER', status: 'PLAYING', joinedAt: new Date(now) },
          ...americanoOthers.map((p) => ({
            userId: p.id,
            role: 'PARTICIPANT' as const,
            status: 'PLAYING' as const,
            joinedAt: new Date(now),
          })),
        ],
      },
    },
    select: { id: true },
  });
  console.log(`${AMERICANO_NAME} · ${club.name} · ${americanoCourt.name}`);
  console.log(`  players: you, ${americanoOthers.map(name).join(', ')}`);
  console.log(`  /games/${americanoGame.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
