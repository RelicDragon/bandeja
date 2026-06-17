import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport, SportLevelSource } from '@prisma/client';
import prisma from '../../src/config/database';
import {
  addUserSport,
  resolveUserSportSnapshot,
} from '../../src/services/user/userSportProfile.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function testSnapshotProfileOnlyDefault(): void {
  const tennis = resolveUserSportSnapshot(
    { id: 'u', level: 4.5, reliability: 20, gamesPlayed: 10, gamesWon: 5 },
    Sport.TENNIS,
  );
  assert(tennis.level === 1.0, 'non-padel without profile defaults level to 1.0');
  assert(tennis.gamesPlayed === 0, 'non-padel without profile defaults gamesPlayed to 0');

  const padel = resolveUserSportSnapshot(
    { id: 'u', level: 4.5, reliability: 20, gamesPlayed: 10, gamesWon: 5, sportProfiles: [] },
    Sport.PADEL,
  );
  assert(padel.level === 1.0, 'padel without profile defaults level to 1.0');
  assert(padel.reliability === 0, 'padel without profile defaults reliability to 0');
  assert(padel.gamesPlayed === 0, 'padel without profile defaults gamesPlayed to 0');
  assert(padel.gamesWon === 0, 'padel without profile defaults gamesWon to 0');
}

function testQuestionnaireNeverTouchesSocialLevel(): void {
  const svcPath = join(__dirname, '../../src/services/user/sportQuestionnaire.service.ts');
  const svcSrc = readFileSync(svcPath, 'utf8');
  assert(!svcSrc.includes('socialLevel:'), 'sportQuestionnaire.service must not assign socialLevel');
  const welcomePath = join(__dirname, '../../src/services/welcomeScreen.service.ts');
  const welcomeSrc = readFileSync(welcomePath, 'utf8');
  assert(!welcomeSrc.includes('socialLevel'), 'welcomeScreen.service must not reference socialLevel');
}

async function testAddUserSportInvariants(): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      socialLevel: true,
      sportsEnabled: true,
    },
  });
  if (!user) {
    console.log('skip: db flow (no active user)');
    return;
  }

  const enabled = user.sportsEnabled ?? [Sport.PADEL];
  const candidates = [Sport.TENNIS, Sport.PICKLEBALL, Sport.BADMINTON, Sport.TABLE_TENNIS, Sport.SQUASH];
  const target = candidates.find((s) => !enabled.includes(s));
  if (!target) {
    console.log('skip: db flow (all candidate sports already enabled)');
    return;
  }

  const socialBefore = user.socialLevel;

  await addUserSport(user.id, target);

  const profile = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId: user.id, sport: target } },
    select: {
      level: true,
      levelSource: true,
      questionnaireCompletedAt: true,
      questionnaireSkippedAt: true,
    },
  });
  if (!profile) {
    assert(false, 'sport profile created');
    return;
  }
  assert(profile.level === 1.0, 'addUserSport sets level 1.0');
  assert(profile.levelSource === SportLevelSource.DEFAULT, 'addUserSport sets levelSource DEFAULT');
  assert(profile.questionnaireCompletedAt == null, 'questionnaire not completed on add');
  assert(profile.questionnaireSkippedAt == null, 'questionnaire not skipped on add');

  const afterUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { socialLevel: true },
  });
  assert(afterUser?.socialLevel === socialBefore, 'addUserSport does not touch socialLevel');

  const loaded = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      sportProfiles: {
        select: { sport: true, level: true, reliability: true, gamesPlayed: true, gamesWon: true },
      },
    },
  });
  if (loaded) {
    const snap = resolveUserSportSnapshot(loaded, target);
    assert(snap.level === 1.0, 'resolveUserSportSnapshot returns 1.0 for new sport profile');
  }

  console.log('ok: addUserSport questionnaire invariants');
}

async function main(): Promise<void> {
  testSnapshotProfileOnlyDefault();
  testQuestionnaireNeverTouchesSocialLevel();
  await testAddUserSportInvariants();
  console.log('multisport-questionnaire-q0: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
