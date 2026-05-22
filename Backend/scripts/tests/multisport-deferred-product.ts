import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import prisma from '../../src/config/database';
import {
  buildSportsPlayed,
  enrichProfileUser,
  SPORTS_PLAYED_THRESHOLD,
  touchLastCreatedSport,
} from '../../src/services/user/userSportProfile.service';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function skip(note: string): void {
  console.log(`SKIP: ${note}`);
}

function testSportsPlayedThreshold(): void {
  assert(SPORTS_PLAYED_THRESHOLD === 3, 'threshold is 3');
  const below = buildSportsPlayed([
    { sport: Sport.TENNIS, level: 3, reliability: 0, gamesPlayed: 2, gamesWon: 1 },
  ]);
  assert(Object.keys(below).length === 0, 'below threshold omitted');

  const at = buildSportsPlayed([
    { sport: Sport.TENNIS, level: 3, reliability: 0, gamesPlayed: 3, gamesWon: 2 },
    { sport: Sport.PADEL, level: 4, reliability: 0, gamesPlayed: 10, gamesWon: 5 },
  ]);
  assert(at.TENNIS === 3, 'at threshold included');
  assert(at.PADEL === 10, 'padel count when over threshold');
  console.log('ok: buildSportsPlayed threshold');
}

function testEnrichProfileUser(): void {
  const enriched = enrichProfileUser({
    id: 'u1',
    sportProfiles: [
      { sport: Sport.PICKLEBALL, level: 2, reliability: 0, gamesPlayed: 5, gamesWon: 2 },
    ],
  });
  assert(enriched.sportsPlayed?.PICKLEBALL === 5, 'enrichProfileUser exposes sportsPlayed');
  console.log('ok: enrichProfileUser adds sportsPlayed');
}

function testSourceWiring(): void {
  const createSrc = readFileSync(
    join(__dirname, '../../src/services/game/create.service.ts'),
    'utf8',
  );
  const profileSrc = readFileSync(
    join(__dirname, '../../src/controllers/user/profile.controller.ts'),
    'utf8',
  );
  const feCreate = readFileSync(
    join(__dirname, '../../../Frontend/src/pages/CreateGame.tsx'),
    'utf8',
  );
  const feProfile = readFileSync(
    join(__dirname, '../../../Frontend/src/utils/profileSports.ts'),
    'utf8',
  );

  assert(createSrc.includes('touchLastCreatedSport'), 'create updates lastCreatedSport');
  assert(profileSrc.includes('enrichProfileUser'), 'profile API enriches sportsPlayed');
  assert(feCreate.includes('resolveCreateGameDefaultSport'), 'CreateGame uses lastCreatedSport helper');
  assert(feProfile.includes('lastCreatedSport'), 'profileSports documents lastCreatedSport');
  console.log('ok: D-P3-PRODUCT wiring (BE create + profile, FE create default)');
}

async function testLastCreatedSportDb(): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, sportsEnabled: true, lastCreatedSport: true },
  });
  if (!user) {
    skip('lastCreatedSport db (no active user)');
    return;
  }

  const restore = user.lastCreatedSport ?? null;
  const target = user.sportsEnabled?.includes(Sport.TENNIS) ? Sport.TENNIS : Sport.PADEL;

  await touchLastCreatedSport(user.id, target);
  const after = await prisma.user.findUnique({
    where: { id: user.id },
    select: { lastCreatedSport: true },
  });
  assert(after?.lastCreatedSport === target, `lastCreatedSport set to ${target}`);

  if (restore) {
    await touchLastCreatedSport(user.id, restore);
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { lastCreatedSport: null } });
  }
  console.log(`ok: touchLastCreatedSport persists ${target} (create path wired via source guard)`);
}

async function main(): Promise<void> {
  testSportsPlayedThreshold();
  testEnrichProfileUser();
  testSourceWiring();
  await testLastCreatedSportDb();
  console.log('multisport-deferred-product: all passed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
