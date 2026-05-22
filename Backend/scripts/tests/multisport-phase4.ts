/**
 * MULTISPORT Phase 4 — Depth (`MULTISPORT_POLISH`) · QA automation (P4-QA-0)
 *
 * Cross-track integration: registry contract, profile read path, P4-A/B/F modules.
 * Dedicated suites: multisport-phase4-profile.ts, -notifications.ts, -playtomic.ts, -leagues.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EntityType, Sport } from '@prisma/client';
import {
  assertRegistryMatchesPrismaEnum,
  getSportConfig,
  SPORT_REGISTRY,
} from '../../src/sport/sportRegistry';
import {
  clampSportLevel,
  getImplementedSports,
  projectUserForSportContext,
  resolveUserSportSnapshot,
} from '../../src/services/user/userSportProfile.service';
import {
  buildGameReminderTitle,
  formatSportLabel,
  formatSportPrefix,
  shouldPrefixSport,
  withOptionalSportPrefix,
} from '../../src/services/shared/notificationSport';
import {
  assertGameSportMatchesLeagueSeason,
  resolveLeagueSeasonSport,
} from '../../src/utils/validators/validateLeagueSeasonSport';
import { validateGameForSport } from '../../src/utils/validators/validateGameForSport';
import { ApiError } from '../../src/utils/ApiError';

const backendRoot = join(__dirname, '..', '..');
const srcRoot = join(backendRoot, 'src');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertThrows(fn: () => void, msg: string): void {
  try {
    fn();
    console.error('FAIL: expected throw —', msg);
    process.exit(1);
  } catch (e) {
    if (!(e instanceof ApiError) && !(e instanceof Error)) {
      console.error('FAIL: wrong error —', msg, e);
      process.exit(1);
    }
  }
}

function testRegistryContract(): void {
  assertRegistryMatchesPrismaEnum();
  const registryKeys = Object.keys(SPORT_REGISTRY).sort();
  const prismaSports = (Object.values(Sport) as Sport[]).sort();
  assert(registryKeys.length === 6, 'registry has exactly 6 sports');
  assert(registryKeys.join(',') === prismaSports.join(','), 'registry keys match Prisma Sport enum');
  for (const sport of prismaSports) {
    const cfg = getSportConfig(sport);
    assert(cfg.id === sport, `${sport} config id`);
    assert(typeof cfg.labelKey === 'string' && cfg.labelKey.length > 0, `${sport} labelKey`);
  }
  console.log('ok: phase-4 registry ↔ Prisma (6 sports, configs load)');
}

function testProfileSelectContract(): void {
  const constantsPath = join(srcRoot, 'utils/constants.ts');
  const src = readFileSync(constantsPath, 'utf8');
  assert(src.includes('primarySport: true'), 'USER_SELECT_FIELDS exposes primarySport');
  assert(src.includes('sportsEnabled: true'), 'PROFILE_SELECT_FIELDS exposes sportsEnabled');
  assert(src.includes('sportProfiles:'), 'PROFILE_SELECT_FIELDS exposes sportProfiles');
  console.log('ok: profile SELECT contract (P0/P4-A read path)');
}

function testSportSnapshotHelpers(): void {
  const user = {
    level: 2.2,
    reliability: 10,
    gamesPlayed: 11,
    gamesWon: 6,
    sportProfiles: [
      { sport: Sport.PADEL, level: 2.7, reliability: 40, gamesPlayed: 20, gamesWon: 13 },
      { sport: Sport.TENNIS, level: 4.3, reliability: 70, gamesPlayed: 9, gamesWon: 5 },
    ],
  };
  const tennis = resolveUserSportSnapshot(user, Sport.TENNIS);
  assert(tennis.level === 4.3, 'resolveUserSportSnapshot uses per-sport level');
  const projected = projectUserForSportContext(user, Sport.TENNIS) as { level: number; sportProfiles?: unknown };
  assert(projected.level === 4.3, 'projectUserForSportContext maps level');
  assert(!('sportProfiles' in projected), 'projectUserForSportContext strips sportProfiles');
  console.log('ok: userSportProfile helpers (P1 baseline for P4-A)');
}

function testProfileApis(): void {
  const controllerPath = join(srcRoot, 'controllers/user/sportProfile.controller.ts');
  const routesPath = join(srcRoot, 'routes/user.routes.ts');
  const servicePath = join(srcRoot, 'services/user/userSportProfile.service.ts');
  assert(existsSync(controllerPath), 'sportProfile.controller.ts exists');
  const controllerSrc = readFileSync(controllerPath, 'utf8');
  const routesSrc = readFileSync(routesPath, 'utf8');
  const serviceSrc = readFileSync(servicePath, 'utf8');
  assert(controllerSrc.includes('addUserSport'), 'addSport uses addUserSport');
  assert(controllerSrc.includes('setUserPrimarySport'), 'setPrimarySport wired');
  assert(controllerSrc.includes('updateUserSportLevel'), 'updateSportProfileLevel wired');
  assert(routesSrc.includes("'/sports'"), 'POST /users/sports route');
  assert(routesSrc.includes("'/primary-sport'"), 'PUT /users/primary-sport route');
  assert(routesSrc.includes("'/sport-profiles/:sport/level'"), 'PUT sport profile level route');
  const updateLevelFn = serviceSrc.match(/async function updateUserSportLevel[\s\S]*?(?=\nexport )/)?.[0] ?? '';
  assert(
    updateLevelFn.includes('userSportProfile.update') && !updateLevelFn.includes('tx.user.update'),
    'updateUserSportLevel writes profile only',
  );

  const implemented = getImplementedSports();
  assert(implemented.includes(Sport.PADEL) && implemented.includes(Sport.TENNIS), 'implemented sports include padel + tennis');
  assert(clampSportLevel(0.5) === 1.0 && clampSportLevel(9) === 7.0, 'clampSportLevel bounds');
  console.log('ok: P4-A profile sport APIs + service helpers');
}

function testNotificationPrefix(): void {
  const modPath = join(srcRoot, 'services/shared/notificationSport.ts');
  assert(existsSync(modPath), 'notificationSport.ts exists');
  assert(!shouldPrefixSport(Sport.PADEL, Sport.PADEL), 'no prefix when sports match');
  assert(!shouldPrefixSport(Sport.PADEL, null), 'padel game + null primary defaults padel');
  assert(shouldPrefixSport(Sport.TENNIS, Sport.PADEL), 'prefix when sports differ');
  assert(formatSportPrefix(Sport.PADEL, Sport.PADEL, 'en') === '', 'empty prefix when equal');
  assert(formatSportPrefix(Sport.TENNIS, Sport.PADEL, 'en') === 'Tennis:', 'en tennis prefix');
  assert(formatSportLabel(Sport.SQUASH, 'ru') === 'Сквош', 'ru squash label');

  const padelReminder = buildGameReminderTitle('GAME', 2, Sport.PADEL, Sport.PADEL, 'en');
  assert(padelReminder === 'Reminder: Your game starts in 2 hours', `padel reminder unchanged (${padelReminder})`);
  const tennisReminder = buildGameReminderTitle('GAME', 2, Sport.TENNIS, Sport.PADEL, 'en');
  assert(tennisReminder.startsWith('Tennis: Reminder:'), `tennis reminder prefixed (${tennisReminder})`);
  const inviteTitle = withOptionalSportPrefix('New Invite', Sport.BADMINTON, Sport.PADEL, 'en');
  assert(inviteTitle === 'Badminton: New Invite', `invite title prefixed (${inviteTitle})`);

  const pushFiles = [
    'services/push/notifications/game-reminder-push.notification.ts',
    'services/push/notifications/invite-push.notification.ts',
    'services/push/notifications/league-round-start-push.notification.ts',
    'services/push/notifications/league-game-assigned-push.notification.ts',
  ];
  for (const rel of pushFiles) {
    const src = readFileSync(join(srcRoot, rel), 'utf8');
    assert(src.includes('notificationSport') || src.includes('withOptionalSportPrefix') || src.includes('buildGameReminderTitle'), `${rel} uses sport prefix helpers`);
  }
  console.log('ok: P4-B notification sport prefix (runtime + push wiring)');
}

function testLeagueSeasonSport(): void {
  const schemaPath = join(backendRoot, 'prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');
  const match = schema.match(/model LeagueSeason \{[\s\S]*?\n\}/);
  if (match == null) {
    console.error('FAIL: LeagueSeason model in schema');
    process.exit(1);
  }
  const leagueSeasonModel = match[0];
  assert(/^\s+sport\s+Sport\b/m.test(leagueSeasonModel), 'LeagueSeason.sport in schema');

  const createPath = join(srcRoot, 'services/league/create.service.ts');
  const gameCreationPath = join(srcRoot, 'services/league/gameCreation.util.ts');
  assert(readFileSync(createPath, 'utf8').includes('sport: seasonSport'), 'league create sets season sport');
  assert(readFileSync(gameCreationPath, 'utf8').includes('loadLeagueSeasonSportOrThrow'), 'league games load season sport');

  assert(
    resolveLeagueSeasonSport({ sport: Sport.TENNIS, game: { sport: Sport.PADEL } }) === Sport.TENNIS,
    'LeagueSeason.sport takes precedence',
  );
  assert(resolveLeagueSeasonSport({ game: { sport: Sport.SQUASH } }) === Sport.SQUASH, 'resolve from game.sport');
  assert(resolveLeagueSeasonSport({}) === Sport.PADEL, 'default PADEL');

  assertThrows(
    () => assertGameSportMatchesLeagueSeason(Sport.TENNIS, { sport: Sport.PADEL }),
    'cross-sport game vs season',
  );

  assert(
    validateGameForSport({
      sport: 'TENNIS',
      entityType: EntityType.LEAGUE_SEASON,
      maxParticipants: 4,
      gameType: 'CLASSIC',
    }) === Sport.TENNIS,
    'tennis league season validates',
  );
  assertThrows(
    () =>
      validateGameForSport({
        sport: 'TENNIS',
        entityType: EntityType.LEAGUE_SEASON,
        maxParticipants: 4,
        gameType: 'AMERICANO',
      }),
    'tennis league rejects AMERICANO',
  );
  console.log('ok: P4-F league season sport (schema + validators + league wiring)');
}

function main(): void {
  testRegistryContract();
  testProfileSelectContract();
  testSportSnapshotHelpers();
  testProfileApis();
  testNotificationPrefix();
  testLeagueSeasonSport();
  console.log('multisport-phase4: all passed');
}

main();
