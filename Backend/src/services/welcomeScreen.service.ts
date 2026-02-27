import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { PROFILE_SELECT_FIELDS } from '../utils/constants';
import { LevelChangeEventType } from '@prisma/client';

const VALID_ANSWERS = ['A', 'B', 'C', 'D'] as const;
const ANSWER_POINTS: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };

function scoreToLevel(totalScore: number): number {
  if (totalScore === 5) return 1.0;
  if (totalScore >= 6 && totalScore <= 8) return 1.5;
  if (totalScore >= 9 && totalScore <= 11) return 2.0;
  if (totalScore >= 12 && totalScore <= 14) return 2.5;
  if (totalScore >= 15 && totalScore <= 17) return 3.0;
  if (totalScore >= 18 && totalScore <= 20) return 3.5;
  return 1.0;
}

export async function completeWelcomeScreen(userId: string, answers: string[]) {
  if (!Array.isArray(answers) || answers.length !== 5) {
    throw new ApiError(400, 'Exactly 5 answers are required');
  }
  for (let i = 0; i < answers.length; i++) {
    if (!VALID_ANSWERS.includes(answers[i] as (typeof VALID_ANSWERS)[number])) {
      throw new ApiError(400, `Invalid answer at question ${i + 1}: must be A, B, C, or D`);
    }
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, level: true, welcomeScreenPassed: true },
  });
  if (!currentUser) throw new ApiError(404, 'User not found');
  if (currentUser.welcomeScreenPassed) {
    throw new ApiError(400, 'Welcome screen already completed');
  }

  const totalScore = answers.reduce((sum, a) => sum + (ANSWER_POINTS[a] ?? 0), 0);
  const userRating = scoreToLevel(totalScore);
  const levelBefore = currentUser.level;

  const user = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { level: userRating, welcomeScreenPassed: true },
    });

    await tx.levelChangeEvent.create({
      data: {
        userId,
        levelBefore,
        levelAfter: userRating,
        eventType: LevelChangeEventType.QUESTIONNAIRE,
        gameId: null,
        linkEntityType: null,
      },
    });

    return tx.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT_FIELDS,
    });
  });

  if (!user) throw new ApiError(500, 'Failed to update user');
  console.log('[welcome] Completed', { userId, levelAfter: userRating });
  return user;
}

export async function resetWelcomeScreen(userId: string) {
  const user = await prisma.$transaction(async (tx) => {
    await tx.levelChangeEvent.deleteMany({
      where: {
        userId,
        eventType: LevelChangeEventType.QUESTIONNAIRE,
        gameId: null,
      },
    });
    return tx.user.update({
      where: { id: userId },
      data: { level: 1.0, welcomeScreenPassed: false },
      select: PROFILE_SELECT_FIELDS,
    });
  });
  if (!user) throw new ApiError(404, 'User not found');
  return user;
}

export async function skipWelcomeScreen(userId: string) {
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, level: true, welcomeScreenPassed: true },
  });
  if (!currentUser) throw new ApiError(404, 'User not found');
  if (currentUser.welcomeScreenPassed) {
    throw new ApiError(400, 'Welcome screen already completed');
  }

  const levelBefore = currentUser.level;
  const user = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { level: 1.0, welcomeScreenPassed: true },
    });
    await tx.levelChangeEvent.create({
      data: {
        userId,
        levelBefore,
        levelAfter: 1.0,
        eventType: LevelChangeEventType.QUESTIONNAIRE,
        gameId: null,
        linkEntityType: null,
      },
    });
    return tx.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT_FIELDS,
    });
  });
  if (!user) throw new ApiError(500, 'Failed to update user');
  return user;
}
