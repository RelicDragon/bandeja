/**
 * Q6 — removeSport: only when gamesPlayed === 0; primary stays valid.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import prisma from '../../src/config/database';
import { ApiError } from '../../src/utils/ApiError';
import {
  addUserSport,
  isUnusedSportProfile,
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
  assert(serviceSrc.includes('isUnusedSportProfile'), 'unused profile helper');
  assert(serviceSrc.includes('userSportProfile.deleteMany'), 'hard-delete unused profile');
}

async function findUserPadelZeroGames(): Promise<{ id: string } | null> {
  const profile = await prisma.userSportProfile.findFirst({
    where: { sport: Sport.PADEL, gamesPlayed: 0 },
    select: { userId: true },
  });
  if (profile) return { id: profile.userId };

  return null;
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

async function testRemovePadelWhenTennisPrimary(): Promise<void> {
  const user = await findUserPadelZeroGames();
  if (!user) {
    console.log('skip: remove padel (no user)');
    return;
  }

  const before = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      sportsEnabled: true,
      primarySport: true,
      sportProfiles: {
        where: { sport: Sport.PADEL },
        select: { level: true },
      },
    },
  });
  if (!before) return;

  const padelLevelBefore = before.sportProfiles[0]?.level ?? 1.0;

  await ensurePadelEnabled(user.id);
  if (!(before.sportsEnabled ?? []).includes(Sport.TENNIS)) {
    await addUserSport(user.id, Sport.TENNIS);
  }
  await setUserPrimarySport(user.id, Sport.TENNIS);

  const afterRemove = await removeUserSport(user.id, Sport.PADEL);
  assert(!afterRemove.sportsEnabled.includes(Sport.PADEL), 'padel removed from sportsEnabled');
  assert(afterRemove.primarySport === Sport.TENNIS, 'primary stays tennis');

  await restorePadel(user.id, padelLevelBefore);
  console.log('ok: add tennis, remove padel when gamesPlayed 0');
}

async function testDisablePadelWithGamesKeepsProfile(): Promise<void> {
  const profile = await prisma.userSportProfile.findFirst({
    where: { sport: Sport.PADEL, gamesPlayed: { gt: 0 } },
    select: { userId: true, gamesPlayed: true },
  });
  if (!profile) {
    console.log('skip: disable padel with games (no profile)');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: profile.userId },
    select: { sportsEnabled: true },
  });
  if (!user) return;

  const beforeEnabled = [...(user.sportsEnabled ?? [])];
  const enabled = new Set<Sport>(beforeEnabled);
  enabled.add(Sport.PADEL);
  enabled.add(Sport.TENNIS);
  await prisma.user.update({
    where: { id: profile.userId },
    data: { sportsEnabled: Array.from(enabled), primarySport: Sport.TENNIS },
  });

  const afterRemove = await removeUserSport(profile.userId, Sport.PADEL);
  assert(!afterRemove.sportsEnabled.includes(Sport.PADEL), 'padel disabled');
  const kept = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId: profile.userId, sport: Sport.PADEL } },
  });
  assert(kept != null, 'padel profile kept when gamesPlayed > 0');
  if (kept) {
    assert(kept.gamesPlayed === profile.gamesPlayed, 'gamesPlayed unchanged');
  }

  await prisma.user.update({
    where: { id: profile.userId },
    data: { sportsEnabled: beforeEnabled },
  });
  console.log('ok: disable padel when gamesPlayed > 0 keeps profile');
}

function testIsUnusedSportProfile(): void {
  assert(
    isUnusedSportProfile(
      {
        level: 1,
        reliability: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        levelSource: 'DEFAULT' as const,
        questionnaireCompletedAt: null,
        questionnaireSkippedAt: null,
        externalRatingHint: null,
      },
      0,
    ),
    'fresh profile is unused',
  );
  assert(
    !isUnusedSportProfile(
      {
        level: 1,
        reliability: 0,
        gamesPlayed: 3,
        gamesWon: 1,
        levelSource: 'DEFAULT' as const,
        questionnaireCompletedAt: null,
        questionnaireSkippedAt: null,
        externalRatingHint: null,
      },
      0,
    ),
    'rated history is used',
  );
  console.log('ok: isUnusedSportProfile');
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
    select: { id: true, sportsEnabled: true, primarySport: true },
  });
  if (!user) {
    console.log('skip: cannot remove last sport (no user)');
    return;
  }

  const beforeEnabled = [...(user.sportsEnabled ?? [])];
  const beforePrimary = user.primarySport ?? Sport.PADEL;

  await prisma.user.update({
    where: { id: user.id },
    data: { sportsEnabled: [Sport.PADEL] },
  });

  let threw = false;
  try {
    await removeUserSport(user.id, Sport.PADEL);
  } catch (e) {
    threw = e instanceof ApiError && e.statusCode === 400;
  }
  assert(threw, 'cannot remove last enabled sport');

  await prisma.user.update({
    where: { id: user.id },
    data: { sportsEnabled: beforeEnabled, primarySport: beforePrimary },
  });
  console.log('ok: cannot remove last enabled sport');
}

async function main(): Promise<void> {
  testRoutesWired();
  testIsUnusedSportProfile();
  testReconcilePrimarySport();
  await testRemovePadelWhenTennisPrimary();
  await testDisablePadelWithGamesKeepsProfile();
  await testCannotRemoveLastSport();
  console.log('multisport-questionnaire-q6: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
