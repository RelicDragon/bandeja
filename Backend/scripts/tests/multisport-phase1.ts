import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import { projectUserForSportContext, resolveUserSportSnapshot } from '../../src/services/user/userSportProfile.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function testSportSnapshotHelpers(): void {
  const user = {
    id: 'u1',
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
  assert(tennis.level === 4.3, 'resolve snapshot uses tennis level');
  assert(tennis.reliability === 70, 'resolve snapshot uses tennis reliability');

  const projected = projectUserForSportContext(user, Sport.TENNIS) as any;
  assert(projected.level === 4.3, 'projected user level matches tennis');
  assert(projected.gamesPlayed === 9, 'projected gamesPlayed matches tennis');
  assert(!('sportProfiles' in projected), 'projected user strips sportProfiles');

  const tennisDefault = resolveUserSportSnapshot(
    {
      id: 'u2',
      level: 3.1,
      reliability: 12,
      gamesPlayed: 4,
      gamesWon: 2,
      sportProfiles: [],
    },
    Sport.TENNIS,
  );
  assert(tennisDefault.level === 1.0, 'non-padel without profile defaults level to 1.0');
  assert(tennisDefault.gamesPlayed === 0, 'non-padel without profile defaults gamesPlayed to 0');

  const padelFallback = resolveUserSportSnapshot(
    { id: 'u2', level: 3.1, reliability: 12, gamesPlayed: 4, gamesWon: 2, sportProfiles: [] },
    Sport.PADEL,
  );
  assert(padelFallback.level === 3.1, 'padel without profile falls back to User.level');
  assert(padelFallback.gamesPlayed === 4, 'padel without profile falls back to User.gamesPlayed');

  const projectedDefault = projectUserForSportContext(
    { id: 'u2', level: 3.1, reliability: 12, gamesPlayed: 4, gamesWon: 2 },
    Sport.TENNIS,
  ) as any;
  assert(projectedDefault.level === 1.0, 'projected tennis without profile uses 1.0');
}

function testSourceGuards(): void {
  const outcomesPath = join(__dirname, '../../src/services/results/outcomes.service.ts');
  const readPath = join(__dirname, '../../src/services/game/read.service.ts');
  const invitePath = join(__dirname, '../../src/services/invite.service.ts');
  const participantPath = join(__dirname, '../../src/services/game/participant.service.ts');
  const socialPath = join(__dirname, '../../src/controllers/user/social.controller.ts');

  const outcomesSrc = readFileSync(outcomesPath, 'utf8');
  const readSrc = readFileSync(readPath, 'utf8');
  const inviteSrc = readFileSync(invitePath, 'utf8');
  const participantSrc = readFileSync(participantPath, 'utf8');
  const socialSrc = readFileSync(socialPath, 'utf8');

  assert(outcomesSrc.includes('resolveUserSportSnapshot'), 'outcomes reads sport snapshot for rating');
  assert(outcomesSrc.includes('ensureSportInEnabled'), 'outcomes syncs sportsEnabled');
  assert(outcomesSrc.includes('userSportProfile.upsert'), 'outcomes writes user sport profile');
  assert(!outcomesSrc.includes('legacyPadelUpdate'), 'outcomes does not dual-write User rating fields');
  assert(readSrc.includes('projectGameUsersForSportContext'), 'game read projects participant level by sport');
  assert(inviteSrc.includes('projectUserForSportContext'), 'invite list projects sender/participants by sport');
  assert(participantSrc.includes('sport: true'), 'sendInvite includes game sport in payload');
  assert(socialSrc.includes('projectUserForSportContext'), 'invitable players projects level by game sport');
  assert(socialSrc.includes('sport: true'), 'invitable players loads game sport when gameId set');
}

function main(): void {
  testSportSnapshotHelpers();
  testSourceGuards();
  console.log('multisport-phase1: all passed');
}

main();
