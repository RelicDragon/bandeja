/**
 * Q6 — removeSport: can disable sports regardless of games; primary stays in sportsEnabled.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import prisma from '../../src/config/database';
import { ApiError } from '../../src/utils/ApiError';
import {
  addUserSport,
  reconcilePrimarySport,
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
  assert(serviceSrc.includes('reconcilePrimarySport'), 'reconcilePrimarySport helper');
  assert(serviceSrc.includes('At least one sport must remain enabled'), 'last-sport guard');
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

function testReconcilePrimarySport(): void {
  assert(
    reconcilePrimarySport(Sport.PADEL, [Sport.TENNIS]) === Sport.TENNIS,
    'reconcile picks first enabled when primary disabled',
  );
  assert(
    reconcilePrimarySport(Sport.TENNIS, [Sport.TENNIS, Sport.PADEL]) === Sport.TENNIS,
    'reconcile keeps primary when enabled',
  );
  console.log('ok: reconcilePrimarySport');
}

async function testCannotRemoveLastSport(): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, sportsEnabled: true, primarySport: true, level: true },
  });
  if (!user) {
    console.log('skip: cannot remove last sport (no user)');
    return;
  }

  const beforeEnabled = [...(user.sportsEnabled ?? [])];
  const beforePrimary = user.primarySport ?? Sport.PADEL;

  await setSportsEnabled(user.id, [Sport.PADEL]);

  let threw = false;
  try {
    await removeUserSport(user.id, Sport.PADEL);
  } catch (e) {
    threw = e instanceof ApiError && e.statusCode === 400;
  }
  assert(threw, 'cannot remove last enabled sport');

  const after = await prisma.user.findUnique({
    where: { id: user.id },
    select: { sportsEnabled: true, primarySport: true },
  });
  assert((after?.sportsEnabled ?? []).includes(after!.primarySport), 'primary in sportsEnabled');

  await prisma.user.update({
    where: { id: user.id },
    data: { sportsEnabled: beforeEnabled, primarySport: beforePrimary },
  });
  console.log('ok: cannot remove last enabled sport');
}

async function main(): Promise<void> {
  testRoutesWired();
  testReconcilePrimarySport();
  await testRemovePadelWhenTennisPrimary();
  await testRemovePadelWithGames();
  await testCannotRemoveLastSport();
  console.log('multisport-questionnaire-q6: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
