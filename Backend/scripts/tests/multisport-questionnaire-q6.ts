/**
 * Q6 — removeSport: can disable sports regardless of games; may deselect all.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import prisma from '../../src/config/database';
import {
  addUserSport,
  removeUserSport,
  setUserPrimarySport,
} from '../../src/services/user/userSportProfile.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function testRoutesWired(): void {
  const routesSrc = readFileSync(join(__dirname, '../../src/routes/user.routes.ts'), 'utf8');
  const serviceSrc = readFileSync(
    join(__dirname, '../../src/services/user/userSportProfile.service.ts'),
    'utf8',
  );
  assert(routesSrc.includes("'/me/sports/:sport'") && routesSrc.includes('removeSport'), 'DELETE remove sport route');
  assert(serviceSrc.includes('removeUserSport'), 'removeUserSport service');
  assert(!serviceSrc.includes('Cannot remove your only sport'), 'no only-sport guard');
  assert(!serviceSrc.includes('Cannot remove sport after playing rated games'), 'no games guard');
}

async function findUserPadelZeroGames(): Promise<{ id: string } | null> {
  const profile = await prisma.userSportProfile.findFirst({
    where: { sport: Sport.PADEL, gamesPlayed: 0 },
    select: { userId: true },
  });
  if (profile) return { id: profile.userId };

  return prisma.user.findFirst({
    where: { isActive: true, gamesPlayed: 0 },
    select: { id: true },
  });
}

async function setSportsEnabled(userId: string, sports: Sport[]): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sportsEnabled: sports },
  });
}

async function ensurePadelEnabled(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sportsEnabled: true },
  });
  const enabled = new Set(user?.sportsEnabled ?? []);
  enabled.add(Sport.PADEL);
  await prisma.user.update({
    where: { id: userId },
    data: { sportsEnabled: Array.from(enabled) },
  });
  await prisma.userSportProfile.upsert({
    where: { userId_sport: { userId, sport: Sport.PADEL } },
    create: {
      userId,
      sport: Sport.PADEL,
      level: 1,
      reliability: 0,
      gamesPlayed: 0,
      gamesWon: 0,
    },
    update: { gamesPlayed: 0, gamesWon: 0 },
  });
}

async function restorePadel(userId: string, padelLevel: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      sportsEnabled: [Sport.PADEL, Sport.TENNIS],
      primarySport: Sport.PADEL,
    },
  });
  await prisma.userSportProfile.upsert({
    where: { userId_sport: { userId, sport: Sport.PADEL } },
    create: {
      userId,
      sport: Sport.PADEL,
      level: padelLevel,
      reliability: 0,
      gamesPlayed: 0,
      gamesWon: 0,
    },
    update: { level: padelLevel, gamesPlayed: 0 },
  });
}

/** Add tennis, primary tennis, remove padel. */
async function testRemovePadelWhenTennisPrimary(): Promise<void> {
  const user = await findUserPadelZeroGames();
  if (!user) {
    console.log('skip: remove padel (no user)');
    return;
  }

  const before = await prisma.user.findUnique({
    where: { id: user.id },
    select: { level: true, sportsEnabled: true, primarySport: true },
  });
  if (!before) return;

  await ensurePadelEnabled(user.id);
  if (!(before.sportsEnabled ?? []).includes(Sport.TENNIS)) {
    await addUserSport(user.id, Sport.TENNIS);
  }
  await setUserPrimarySport(user.id, Sport.TENNIS);

  const afterRemove = await removeUserSport(user.id, Sport.PADEL);
  assert(!afterRemove.sportsEnabled.includes(Sport.PADEL), 'padel removed from sportsEnabled');
  assert(afterRemove.primarySport === Sport.TENNIS, 'primary stays tennis');
  assert(
    afterRemove.sportProfiles?.some((p) => p.sport === Sport.PADEL),
    'padel profile row kept for re-enable',
  );

  await restorePadel(user.id, before.level);
  console.log('ok: add tennis, remove padel');
}

async function testRemovePadelWithGames(): Promise<void> {
  const profile = await prisma.userSportProfile.findFirst({
    where: { sport: Sport.PADEL, gamesPlayed: { gt: 0 } },
    select: { userId: true },
  });
  if (!profile) {
    console.log('skip: remove padel with games (no profile)');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: profile.userId },
    select: { sportsEnabled: true, primarySport: true },
  });
  if (!user) return;

  const enabled = new Set<Sport>(user.sportsEnabled ?? []);
  enabled.add(Sport.PADEL);
  enabled.add(Sport.TENNIS);
  await prisma.user.update({
    where: { id: profile.userId },
    data: { sportsEnabled: Array.from(enabled), primarySport: Sport.TENNIS },
  });

  const after = await removeUserSport(profile.userId, Sport.PADEL);
  assert(!after.sportsEnabled.includes(Sport.PADEL), 'padel removed despite games');
  console.log('ok: remove padel when gamesPlayed > 0');
}

async function testRemoveAllSports(): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, sportsEnabled: true, primarySport: true, level: true },
  });
  if (!user) {
    console.log('skip: remove all sports (no user)');
    return;
  }

  const beforeEnabled = [...(user.sportsEnabled ?? [])];
  const beforePrimary = user.primarySport ?? Sport.PADEL;

  await setSportsEnabled(user.id, [Sport.PADEL, Sport.TENNIS]);

  for (const sport of [Sport.PADEL, Sport.TENNIS]) {
    await removeUserSport(user.id, sport);
  }

  const after = await prisma.user.findUnique({
    where: { id: user.id },
    select: { sportsEnabled: true },
  });
  assert((after?.sportsEnabled ?? []).length === 0, 'sportsEnabled empty');

  await prisma.user.update({
    where: { id: user.id },
    data: { sportsEnabled: beforeEnabled, primarySport: beforePrimary },
  });
  console.log('ok: remove all enabled sports');
}

async function main(): Promise<void> {
  testRoutesWired();
  await testRemovePadelWhenTennisPrimary();
  await testRemovePadelWithGames();
  await testRemoveAllSports();
  console.log('multisport-questionnaire-q6: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
