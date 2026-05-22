/**
 * QA matrix §11 — tennis questionnaire (Q2).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport, SportLevelSource } from '@prisma/client';
import prisma from '../../src/config/database';
import { TENNIS_QUESTIONNAIRE_V1 } from '../../src/sport/questionnaires/tennis';
import { scoreToLevel } from '../../src/sport/questionnaires/scoring';
import { ApiError } from '../../src/utils/ApiError';
import {
  addUserSport,
  resolveUserSportSnapshot,
  updateUserSportLevel,
} from '../../src/services/user/userSportProfile.service';
import {
  completeSportQuestionnaire,
  getSportQuestionnaireStatus,
  rejectSocialLevelInQuestionnaireBody,
  skipSportQuestionnaire,
} from '../../src/services/user/sportQuestionnaire.service';
import { isQuestionnaireEngineEnabled } from '../../src/utils/multisportQuestionnaireFlags';

process.env.MULTISPORT_QUESTIONNAIRE_ENGINE = 'true';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function assertApiError(fn: () => Promise<unknown>, code: number, msgPart: string): Promise<void> {
  return fn().then(
    () => {
      console.error('FAIL: expected ApiError —', msgPart);
      process.exit(1);
    },
    (e: unknown) => {
      if (!(e instanceof ApiError) || e.statusCode !== code) {
        console.error('FAIL: wrong error —', msgPart, e);
        process.exit(1);
      }
    },
  );
}

function testRegistryAndScoring(): void {
  assert(TENNIS_QUESTIONNAIRE_V1.id === 'tennis-v1', 'tennis-v1 id');
  assert(TENNIS_QUESTIONNAIRE_V1.minQuestions === 5, 'tennis 5 questions');
  assert(scoreToLevel(5) === 1.0 && scoreToLevel(20) === 3.5, 'score band 5–20 → 1.0–3.5');
}

function testRoutesWired(): void {
  const routesSrc = readFileSync(join(__dirname, '../../src/routes/user.routes.ts'), 'utf8');
  assert(routesSrc.includes('/me/sports/:sport/questionnaire'), 'POST questionnaire route');
  assert(routesSrc.includes('/me/sports/:sport/questionnaire/skip'), 'POST skip route');
  assert(routesSrc.includes('/me/sports/:sport/questionnaire/status'), 'GET status route');
  assert(routesSrc.includes('completeSportQuestionnaireHandler'), 'complete handler');
}

function testServiceGuard(): void {
  const svcPath = join(__dirname, '../../src/services/user/sportQuestionnaire.service.ts');
  const src = readFileSync(svcPath, 'utf8');
  assert(!src.includes('socialLevel:'), 'sportQuestionnaire.service must not assign socialLevel');
  let threw = false;
  try {
    rejectSocialLevelInQuestionnaireBody({ answers: ['A', 'A', 'A', 'A', 'A'], socialLevel: 5 });
  } catch (e) {
    threw = e instanceof ApiError && e.statusCode === 400;
  }
  assert(threw, 'reject socialLevel in body');
}

async function findUserWithoutTennis(): Promise<{ id: string; level: number; socialLevel: number } | null> {
  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      NOT: { sportsEnabled: { has: Sport.TENNIS } },
    },
    select: { id: true, level: true, socialLevel: true },
  });
  return user;
}

async function resetTennisProfile(userId: string): Promise<void> {
  await prisma.userSportProfile.deleteMany({ where: { userId, sport: Sport.TENNIS } }).catch(() => undefined);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sportsEnabled: true },
  });
  if (!user) return;
  const enabled = (user.sportsEnabled ?? [Sport.PADEL]).filter((s) => s !== Sport.TENNIS);
  await prisma.user.update({
    where: { id: userId },
    data: { sportsEnabled: enabled.length > 0 ? enabled : [Sport.PADEL] },
  });
}

/** §11: Add tennis, skip Q — tennis 1.0; padel unchanged. */
async function testAddTennisSkipQ(): Promise<void> {
  const user = await findUserWithoutTennis();
  if (!user) {
    console.log('skip: add tennis skip Q (no suitable user)');
    return;
  }

  const padelBefore = await prisma.user.findUnique({
    where: { id: user.id },
    select: { level: true, socialLevel: true },
  });

  const { user: afterAdd, suggestedQuestionnaire } = await addUserSport(user.id, Sport.TENNIS);
  assert(suggestedQuestionnaire === true, 'addUserSport suggests tennis questionnaire');
  assert(afterAdd.sportsEnabled.includes(Sport.TENNIS), 'tennis enabled');

  await skipSportQuestionnaire(user.id, Sport.TENNIS);
  const status = await getSportQuestionnaireStatus(user.id, Sport.TENNIS);
  assert(status.skipped && !status.suggested, 'skip marks skipped, not suggested');
  assert(status.level === 1.0, 'skip keeps level 1.0');

  const after = await prisma.user.findUnique({
    where: { id: user.id },
    select: { level: true, socialLevel: true, sportProfiles: { where: { sport: Sport.TENNIS } } },
  });
  assert(after?.level === padelBefore?.level, 'User.level unchanged');
  assert(after?.socialLevel === padelBefore?.socialLevel, 'socialLevel unchanged');
  assert(after?.sportProfiles[0]?.level === 1.0, 'tennis profile 1.0');

  await resetTennisProfile(user.id);
  console.log('ok: add tennis skip Q — padel/social unchanged');
}

/** §11: Complete tennis Q — level 1.5–3.5; padel unchanged. */
async function testCompleteTennisQ(): Promise<void> {
  const user = await findUserWithoutTennis();
  if (!user) {
    console.log('skip: complete tennis Q (no suitable user)');
    return;
  }

  const padelLevelBefore = user.level;
  await addUserSport(user.id, Sport.TENNIS);

  const answers = ['C', 'C', 'C', 'C', 'C'];
  const status = await completeSportQuestionnaire(user.id, Sport.TENNIS, answers);
  assert(status.completed && !status.suggested, 'completed clears suggested');
  assert(status.level >= 1.5 && status.level <= 3.5, 'tennis level in questionnaire band');

  const profile = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId: user.id, sport: Sport.TENNIS } },
  });
  assert(profile?.levelSource === SportLevelSource.QUESTIONNAIRE, 'levelSource QUESTIONNAIRE');
  assert(profile?.questionnaireVersion === 'tennis-v1', 'questionnaireVersion tennis-v1');

  const event = await prisma.levelChangeEvent.findFirst({
    where: { userId: user.id, sport: Sport.TENNIS, eventType: 'QUESTIONNAIRE' },
    orderBy: { createdAt: 'desc' },
  });
  assert(event != null && event.levelAfter === status.level, 'LevelChangeEvent with sport');

  const afterUser = await prisma.user.findUnique({ where: { id: user.id }, select: { level: true } });
  assert(afterUser?.level === padelLevelBefore, 'padel User.level unchanged');

  await assertApiError(
    () => completeSportQuestionnaire(user.id, Sport.TENNIS, answers),
    400,
    'second complete rejected',
  );

  await resetTennisProfile(user.id);
  console.log('ok: complete tennis Q');
}

/** §11: Complete after rated tennis game → 400. */
async function testCompleteAfterRatedGame(): Promise<void> {
  const profile = await prisma.userSportProfile.findFirst({
    where: { sport: Sport.TENNIS, gamesPlayed: { gt: 0 } },
    select: { userId: true },
  });
  if (!profile) {
    console.log('skip: complete after rated game (no tennis profile with gamesPlayed > 0)');
    return;
  }

  await assertApiError(
    () => completeSportQuestionnaire(profile.userId, Sport.TENNIS, ['A', 'A', 'A', 'A', 'A']),
    400,
    'questionnaire locked after rated games',
  );
  console.log('ok: complete tennis Q after rated game → 400');
}

/** §11: Padel gamesPlayed does not block tennis Q. */
async function testPadelGamesDoNotBlockTennisQ(): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      gamesPlayed: { gt: 0 },
      NOT: { sportsEnabled: { has: Sport.TENNIS } },
    },
    select: { id: true },
  });
  if (!user) {
    console.log('skip: padel games do not block tennis Q');
    return;
  }

  await addUserSport(user.id, Sport.TENNIS);
  const status = await getSportQuestionnaireStatus(user.id, Sport.TENNIS);
  assert(status.suggested, 'tennis Q still suggested when padel has games');

  await resetTennisProfile(user.id);
  console.log('ok: padel gamesPlayed does not block tennis Q');
}

function testFeatureFlagOff(): void {
  const prev = process.env.MULTISPORT_QUESTIONNAIRE_ENGINE;
  process.env.MULTISPORT_QUESTIONNAIRE_ENGINE = 'false';
  assert(!isQuestionnaireEngineEnabled(), 'engine flag false disables questionnaire API');
  process.env.MULTISPORT_QUESTIONNAIRE_ENGINE = prev ?? 'true';
  console.log('ok: MULTISPORT_QUESTIONNAIRE_ENGINE guard');
}

async function testSnapshotJoinAtOne(): Promise<void> {
  const user = await findUserWithoutTennis();
  if (!user) {
    console.log('skip: tennis snapshot 1.0');
    return;
  }
  await addUserSport(user.id, Sport.TENNIS);
  const loaded = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      level: true,
      sportProfiles: { select: { sport: true, level: true, gamesPlayed: true, gamesWon: true, reliability: true } },
    },
  });
  const snap = resolveUserSportSnapshot(loaded!, Sport.TENNIS);
  assert(snap.level === 1.0, 'tennis snapshot 1.0 before Q');
  await resetTennisProfile(user.id);
  console.log('ok: tennis snapshot 1.0 for join');
}

async function main(): Promise<void> {
  testRegistryAndScoring();
  testRoutesWired();
  testServiceGuard();
  testFeatureFlagOff();
  await testAddTennisSkipQ();
  await testCompleteTennisQ();
  await testCompleteAfterRatedGame();
  await testPadelGamesDoNotBlockTennisQ();
  await testSnapshotJoinAtOne();
  console.log('multisport-questionnaire-tennis: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
