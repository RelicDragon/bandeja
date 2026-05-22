import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import prisma from '../../src/config/database';
import {
  addUserSport,
  clampSportLevel,
  getImplementedSports,
  resolveUserSportSnapshot,
  setUserPrimarySport,
  updateUserSportLevel,
} from '../../src/services/user/userSportProfile.service';
import { getImplementedSports as registryImplemented } from '../../src/sport/sportRegistry';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function testRegistryParity(): void {
  const fromService = getImplementedSports();
  const fromRegistry = registryImplemented();
  assert(fromService.length === fromRegistry.length, 'getImplementedSports parity');
  assert(fromRegistry.includes(Sport.PADEL), 'padel implemented');
  assert(fromRegistry.includes(Sport.TENNIS), 'tennis implemented');
}

function testClamp(): void {
  assert(clampSportLevel(0.5) === 1.0, 'clamp min');
  assert(clampSportLevel(9) === 7.0, 'clamp max');
}

function testSourceGuards(): void {
  const routesPath = join(__dirname, '../../src/routes/user.routes.ts');
  const servicePath = join(__dirname, '../../src/services/user/userSportProfile.service.ts');
  const routesSrc = readFileSync(routesPath, 'utf8');
  const serviceSrc = readFileSync(servicePath, 'utf8');

  assert(routesSrc.includes("'/sports'"), 'POST /users/sports route');
  assert(routesSrc.includes("'/primary-sport'"), 'PUT /users/primary-sport route');
  assert(routesSrc.includes("'/sport-profiles/:sport/level'"), 'PUT sport profile level route');
  const updateLevelFn = serviceSrc.match(/async function updateUserSportLevel[\s\S]*?(?=\nexport )/)?.[0] ?? '';
  assert(
    updateLevelFn.includes('userSportProfile.update') && !updateLevelFn.includes('tx.user.update'),
    'updateUserSportLevel writes profile only',
  );
  assert(serviceSrc.includes('countRatedSportOutcomes'), 'add sport reconciles ghost profiles');
  assert(serviceSrc.includes('ensureSportInEnabled'), 'sport enabled sync helper');
}

async function testDbFlow(): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true, sportsEnabled: true, primarySport: true },
  });
  if (!user) {
    console.log('skip: db flow (no active user)');
    return;
  }

  const beforeEnabled = user.sportsEnabled ?? [Sport.PADEL];
  const target = beforeEnabled.includes(Sport.TENNIS) ? Sport.PICKLEBALL : Sport.TENNIS;
  if (beforeEnabled.includes(target)) {
    console.log('skip: db flow (target sport already enabled)');
    return;
  }

  const { user: afterAdd } = await addUserSport(user.id, target);
  assert(afterAdd.sportsEnabled.includes(target), 'sport added to sportsEnabled');
  assert(
    afterAdd.sportProfiles?.some((p) => p.sport === target),
    'sport profile created',
  );

  const snap = resolveUserSportSnapshot(afterAdd, target);
  assert(snap.level >= 1 && snap.level <= 7, 'new profile level in range');

  await setUserPrimarySport(user.id, user.primarySport);
  await updateUserSportLevel(user.id, target, 2.5);

  const padelBefore = await prisma.user.findUnique({
    where: { id: user.id },
    select: { level: true },
  });
  await updateUserSportLevel(user.id, target, 3.0);
  const padelAfter = await prisma.user.findUnique({
    where: { id: user.id },
    select: { level: true },
  });
  assert(padelBefore?.level === padelAfter?.level, 'non-padel level update does not touch User.level');

  console.log('ok: db add sport + level update');
}

async function main(): Promise<void> {
  testRegistryParity();
  testClamp();
  testSourceGuards();
  await testDbFlow();
  console.log('multisport-phase4-profile: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
