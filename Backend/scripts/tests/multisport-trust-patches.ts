/**
 * Sport-scoped level display/calculation trust patches (outcome explanation, league groups, telegram results, merge).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import { resolveUserSportSnapshot } from '../../src/services/user/userSportProfile.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function readSrc(rel: string): string {
  return readFileSync(join(__dirname, '../../src', rel), 'utf8');
}

function testSourcePatches(): void {
  const explanation = readSrc('services/results/outcomeExplanation.service.ts');
  assert(
    explanation.includes('resolveUserSportSnapshot'),
    'outcomeExplanation uses resolveUserSportSnapshot',
  );
  assert(
    !explanation.includes('p.user.level') && !explanation.includes('user.level'),
    'outcomeExplanation avoids raw user.level',
  );

  const league = readSrc('services/league/create.service.ts');
  assert(
    league.includes('resolveUserSportSnapshot') && league.includes('seasonSport'),
    'league createGroups uses sport-scoped sort level',
  );

  const telegram = readSrc('services/telegram/results-telegram.service.ts');
  assert(
    telegram.includes('resolveUserSportSnapshot'),
    'results-telegram uses sport snapshot for participant level',
  );

  const html = readSrc('services/telegram/results-html.service.ts');
  assert(
    html.includes('projectUserForSportContext'),
    'results-html projects outcome users by game sport',
  );

  const merge = readSrc('services/user/userMerge.service.ts');
  assert(merge.includes('mergeUserSportProfiles'), 'userMerge merges UserSportProfile rows');

  const postJoin = readSrc('utils/postJoinOperations.ts');
  assert(
    postJoin.includes('ensureUserSportProfileForGame'),
    'postJoin ensures sport profile on game join (ADR-Q9)',
  );

  const controller = readSrc('controllers/game.controller.ts');
  assert(
    controller.includes('projectGameUsersForSportContext'),
    'telegram game path projects users for sport',
  );
}

function testResolveSnapshotUnit(): void {
  const user = {
    level: 5.0,
    reliability: 80,
    gamesPlayed: 100,
    gamesWon: 50,
    sportProfiles: [{ sport: Sport.TENNIS, level: 2.5, reliability: 10, gamesPlayed: 3, gamesWon: 1 }],
  };
  const tennis = resolveUserSportSnapshot(user, Sport.TENNIS);
  assert(tennis.level === 2.5, 'snapshot prefers sport profile over global level');
  const padel = resolveUserSportSnapshot(user, Sport.PADEL);
  assert(padel.level === 1.0, 'padel without profile uses default snapshot');
}

function main(): void {
  testSourcePatches();
  testResolveSnapshotUnit();
  console.log('multisport-trust-patches: OK');
}

main();
