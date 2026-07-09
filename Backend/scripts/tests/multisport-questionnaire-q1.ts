import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import prisma from '../../src/config/database';
import { PADEL_QUESTIONNAIRE_V1 } from '../../src/sport/questionnaires/padel';
import { scoreToLevel } from '../../src/sport/questionnaires/scoring';
import { getSportConfig } from '../../src/sport/sportRegistry';
import {
  completeSportQuestionnaire,
  getSportQuestionnaireStatus,
  resetSportQuestionnaire,
  skipSportQuestionnaire,
} from '../../src/services/user/sportQuestionnaire.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function testPadelRegistry(): void {
  const padel = getSportConfig(Sport.PADEL).questionnaire;
  assert(padel?.id === 'padel-v1', 'padel registry questionnaire id');
  assert(padel?.minQuestions === 5, 'padel has 5 questions');
  assert(padel?.questionKeys[0] === 'welcome.q1', 'padel reuses welcome i18n keys');
}

function testScoreToLevelBands(): void {
  assert(scoreToLevel(5) === 1.0, 'score 5 → 1.0');
  assert(scoreToLevel(7) === 1.5, 'score 7 → 1.5');
  assert(scoreToLevel(20) === 3.5, 'score 20 → 3.5');
  assert(PADEL_QUESTIONNAIRE_V1.scoreToLevel(15) === 3.0, 'padel config scoreToLevel');
}

function testQuestionnaireServiceGuard(): void {
  const svcPath = join(__dirname, '../../src/services/user/sportQuestionnaire.service.ts');
  const src = readFileSync(svcPath, 'utf8');
  assert(!src.includes('socialLevel:'), 'questionnaire service must not assign socialLevel');
  assert(src.includes('rejectSocialLevelInQuestionnaireBody'), 'rejects socialLevel in body');
  assert(!src.includes('data: { welcomeScreenPassed'), 'questionnaire service must not dual-write welcomeScreenPassed');
}

async function testPadelLegacyWelcomeStatus(): Promise<void> {
  const user = await prisma.user.create({
    data: {
      phone: `+1555${Date.now().toString().slice(-7)}`,
      welcomeScreenPassed: true,
      cityIsSet: true,
      sportProfiles: {
        create: {
          sport: Sport.PADEL,
          level: 1,
          gamesPlayed: 0,
        },
      },
    },
    select: { id: true },
  });

  try {
    const status = await getSportQuestionnaireStatus(user.id, Sport.PADEL);
    assert(status.skipped, 'legacy welcomeScreenPassed without markers → skipped');
    assert(!status.suggested, 'legacy welcome user not suggested');

    const skipStatus = await skipSportQuestionnaire(user.id, Sport.PADEL);
    assert(skipStatus.skipped, 'legacy skip is idempotent');

    const profile = await prisma.userSportProfile.findUnique({
      where: { userId_sport: { userId: user.id, sport: Sport.PADEL } },
      select: { questionnaireSkippedAt: true },
    });
    assert(profile?.questionnaireSkippedAt != null, 'legacy skip repairs questionnaireSkippedAt');
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
}

async function testPadelQuestionnaireFlow(): Promise<void> {
  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      welcomeScreenPassed: false,
      OR: [
        { sportProfiles: { none: { sport: Sport.PADEL } } },
        { sportProfiles: { some: { sport: Sport.PADEL, gamesPlayed: 0 } } },
      ],
    },
    select: { id: true, socialLevel: true },
  });
  if (!user) {
    console.log('skip: padel questionnaire flow (no eligible user: welcome open + 0 rated padel games)');
    return;
  }

  const socialBefore = user.socialLevel;
  const answers = ['B', 'B', 'B', 'B', 'B'];

  try {
    const status = await completeSportQuestionnaire(user.id, Sport.PADEL, answers);
    assert(status.completed, 'status completed after padel Q');
    assert(status.level === 2.0, 'BBBBB → score 10 → level 2.0');

    const afterUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        socialLevel: true,
        sportProfiles: {
          where: { sport: Sport.PADEL },
          select: {
            level: true,
            levelSource: true,
            questionnaireCompletedAt: true,
            questionnaireVersion: true,
          },
        },
      },
    });
    assert(afterUser?.socialLevel === socialBefore, 'socialLevel unchanged');
    const profile = afterUser?.sportProfiles[0];
    assert(profile?.level === 2.0, 'padel profile level from questionnaire');
    assert(profile?.questionnaireCompletedAt != null, 'padel profile questionnaireCompletedAt');
    assert(profile?.questionnaireVersion === 'padel-v1', 'padel questionnaire version');

    const status2 = await getSportQuestionnaireStatus(user.id, Sport.PADEL);
    assert(status2.completed, 'getStatus completed');

    console.log('ok: padel questionnaire complete flow');
  } finally {
    await resetSportQuestionnaire(user.id, Sport.PADEL);
  }
}

async function main(): Promise<void> {
  testPadelRegistry();
  testScoreToLevelBands();
  testQuestionnaireServiceGuard();
  await testPadelLegacyWelcomeStatus();
  await testPadelQuestionnaireFlow();
  console.log('multisport-questionnaire-q1: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
