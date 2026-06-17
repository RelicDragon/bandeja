/**
 * QA — Q4 questionnaires: pickleball, badminton, table tennis, squash.
 */
import { Sport, SportLevelSource } from '@prisma/client';
import prisma from '../../src/config/database';
import { getSportConfig } from '../../src/sport/sportRegistry';
import {
  BADMINTON_QUESTIONNAIRE_V1,
  PICKLEBALL_QUESTIONNAIRE_V1,
  SQUASH_QUESTIONNAIRE_V1,
  TABLE_TENNIS_QUESTIONNAIRE_V1,
} from '../../src/sport/questionnaires';
import { scoreToLevel, scoreToLevelFourQuestions } from '../../src/sport/questionnaires/scoring';
import { ApiError } from '../../src/utils/ApiError';
import { addUserSport } from '../../src/services/user/userSportProfile.service';
import {
  completeSportQuestionnaire,
  getSportQuestionnaireStatus,
} from '../../src/services/user/sportQuestionnaire.service';

process.env.MULTISPORT_QUESTIONNAIRE_ENGINE = 'true';

const Q4_SPORTS: Sport[] = [
  Sport.PICKLEBALL,
  Sport.BADMINTON,
  Sport.TABLE_TENNIS,
  Sport.SQUASH,
];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function testRegistry(): void {
  assert(PICKLEBALL_QUESTIONNAIRE_V1.id === 'pickleball-v1', 'pickleball-v1');
  assert(PICKLEBALL_QUESTIONNAIRE_V1.minQuestions === 5, 'pickleball 5q');
  assert(BADMINTON_QUESTIONNAIRE_V1.id === 'badminton-v1', 'badminton-v1');
  assert(BADMINTON_QUESTIONNAIRE_V1.minQuestions === 5, 'badminton 5q');
  assert(TABLE_TENNIS_QUESTIONNAIRE_V1.id === 'table-tennis-v1', 'table-tennis-v1');
  assert(TABLE_TENNIS_QUESTIONNAIRE_V1.minQuestions === 5, 'table tennis 5q');
  assert(SQUASH_QUESTIONNAIRE_V1.id === 'squash-v1', 'squash-v1');
  assert(SQUASH_QUESTIONNAIRE_V1.minQuestions === 5, 'squash 5q');

  for (const sport of Q4_SPORTS) {
    assert(getSportConfig(sport).questionnaire != null, `${sport} registry questionnaire`);
  }

  assert(scoreToLevel(5) === 1.0 && scoreToLevel(20) === 3.5, '5q band');
  assert(scoreToLevelFourQuestions(4) === 1.0 && scoreToLevelFourQuestions(16) === 3.5, '4q band');
  assert(TABLE_TENNIS_QUESTIONNAIRE_V1.scoreToLevel(15) === 3.0, '5q all-C → 3.0');
  assert(SQUASH_QUESTIONNAIRE_V1.scoreToLevel(20) === 3.5, '5q all-D → 3.5');
  console.log('ok: Q4 registry + scoring');
}

function answersForSport(sport: Sport, letter: 'A' | 'B' | 'C' | 'D'): string[] {
  const n = getSportConfig(sport).questionnaire!.minQuestions;
  return Array.from({ length: n }, () => letter);
}

async function findUserWithoutSport(sport: Sport): Promise<{
  id: string;
  padelLevel: number;
  socialLevel: number;
} | null> {
  const user = await prisma.user.findFirst({
    where: { isActive: true, NOT: { sportsEnabled: { has: sport } } },
    select: {
      id: true,
      socialLevel: true,
      sportProfiles: {
        where: { sport: Sport.PADEL },
        select: { level: true },
      },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    padelLevel: user.sportProfiles[0]?.level ?? 1.0,
    socialLevel: user.socialLevel,
  };
}

async function resetSportProfile(userId: string, sport: Sport): Promise<void> {
  await prisma.userSportProfile.deleteMany({ where: { userId, sport } }).catch(() => undefined);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sportsEnabled: true },
  });
  if (!user) return;
  const enabled = (user.sportsEnabled ?? [Sport.PADEL]).filter((s) => s !== sport);
  await prisma.user.update({
    where: { id: userId },
    data: { sportsEnabled: enabled.length > 0 ? enabled : [Sport.PADEL] },
  });
}

async function testCompleteSportQ(sport: Sport): Promise<void> {
  const user = await findUserWithoutSport(sport);
  if (!user) {
    console.log(`skip: complete ${sport} Q (no suitable user)`);
    return;
  }

  const padelLevelBefore = user.padelLevel;
  const socialBefore = user.socialLevel;
  const { suggestedQuestionnaire } = await addUserSport(user.id, sport);
  assert(suggestedQuestionnaire === true, `${sport} add suggests Q`);

  const answers = answersForSport(sport, 'C');
  const status = await completeSportQuestionnaire(user.id, sport, answers);
  assert(status.completed && !status.suggested, `${sport} completed`);
  assert(status.level >= 1.5 && status.level <= 3.5, `${sport} level in band`);

  const config = getSportConfig(sport).questionnaire!;
  const profile = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId: user.id, sport } },
  });
  assert(profile?.levelSource === SportLevelSource.QUESTIONNAIRE, `${sport} levelSource`);
  assert(profile?.questionnaireVersion === config.id, `${sport} version`);

  const padelProfileAfter = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId: user.id, sport: Sport.PADEL } },
    select: { level: true },
  });
  const afterUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { socialLevel: true },
  });
  assert(padelProfileAfter?.level === padelLevelBefore, `${sport}: padel profile level unchanged`);
  assert(afterUser?.socialLevel === socialBefore, `${sport}: socialLevel unchanged`);

  await resetSportProfile(user.id, sport);
  console.log(`ok: complete ${sport} Q`);
}

async function testWrongAnswerCount(sport: Sport): Promise<void> {
  const user = await findUserWithoutSport(sport);
  if (!user) return;

  await addUserSport(user.id, sport);
  const n = getSportConfig(sport).questionnaire!.minQuestions;
  let threw = false;
  try {
    await completeSportQuestionnaire(user.id, sport, Array(n - 1).fill('A'));
  } catch (e) {
    threw = e instanceof ApiError && e.statusCode === 400;
  }
  assert(threw, `${sport} rejects wrong answer count`);
  await resetSportProfile(user.id, sport);
}

async function main(): Promise<void> {
  testRegistry();
  for (const sport of Q4_SPORTS) {
    await testCompleteSportQ(sport);
    await testWrongAnswerCount(sport);
  }

  const padelUser = await prisma.user.findFirst({
    where: { isActive: true, sportsEnabled: { has: Sport.PADEL } },
    select: { id: true },
  });
  if (padelUser) {
    const padelStatus = await getSportQuestionnaireStatus(padelUser.id, Sport.PADEL);
    assert(typeof padelStatus.level === 'number', 'padel status still works');
  }

  console.log('multisport-questionnaire-q4: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
