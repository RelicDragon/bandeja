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

function testProfileUserPayloadContract(): void {
  const constantsPath = join(__dirname, '../../src/utils/constants.ts');
  const profileCtrlPath = join(__dirname, '../../src/controllers/user/profile.controller.ts');
  const authCtrlPath = join(__dirname, '../../src/controllers/auth.controller.ts');
  const refreshCtrlPath = join(__dirname, '../../src/controllers/authRefresh.controller.ts');
  const refreshSvcPath = join(__dirname, '../../src/services/auth/userRefreshSession.service.ts');
  const oauthPath = join(__dirname, '../../src/services/auth/oauthLogin.service.ts');

  const constantsSrc = readFileSync(constantsPath, 'utf8');
  const profileCtrlSrc = readFileSync(profileCtrlPath, 'utf8');
  const authCtrlSrc = readFileSync(authCtrlPath, 'utf8');
  const refreshCtrlSrc = readFileSync(refreshCtrlPath, 'utf8');
  const refreshSvcSrc = readFileSync(refreshSvcPath, 'utf8');
  const oauthSrc = readFileSync(oauthPath, 'utf8');

  assert(
    /export const PROFILE_SELECT_FIELDS[\s\S]*primarySportIsSet:\s*true/.test(constantsSrc),
    'PROFILE_SELECT_FIELDS must select primarySportIsSet for API user payloads',
  );
  assert(
    profileCtrlSrc.includes('select: PROFILE_SELECT_FIELDS'),
    'GET /users/profile must use PROFILE_SELECT_FIELDS',
  );
  assert(authCtrlSrc.includes('PROFILE_SELECT_FIELDS'), 'auth login/register must use PROFILE_SELECT_FIELDS');
  assert(oauthSrc.includes('PROFILE_SELECT_FIELDS'), 'oauth login must use PROFILE_SELECT_FIELDS');
  assert(refreshSvcSrc.includes('PROFILE_SELECT_FIELDS'), 'refresh rotation must load PROFILE_SELECT_FIELDS');
  assert(refreshCtrlSrc.includes('user: out.user'), 'POST /auth/refresh must return user in data');
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

  const padelBefore = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId: user.id, sport: Sport.PADEL } },
    select: { level: true },
  });
  await updateUserSportLevel(user.id, target, 3.0);
  const padelAfter = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId: user.id, sport: Sport.PADEL } },
    select: { level: true },
  });
  assert(padelBefore?.level === padelAfter?.level, 'non-padel level update does not touch padel profile');

  console.log('ok: db add sport + level update');
}

async function main(): Promise<void> {
  testRegistryParity();
  testClamp();
  testProfileUserPayloadContract();
  testSourceGuards();
  await testDbFlow();
  console.log('multisport-phase4-profile: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
