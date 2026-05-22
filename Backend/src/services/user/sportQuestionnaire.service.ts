import { LevelChangeEventType, Sport, SportLevelSource } from '@prisma/client';
import prisma from '../../config/database';
import { validatePadelQuestionnaireAnswers } from '../../sport/questionnaires/padel';
import { sumAnswerScores, validateAnswers } from '../../sport/questionnaires/scoring';
import { isQuestionnaireSuggestedForProfile } from '../../sport/questionnaires/suggested';
import { getSportConfig } from '../../sport/sportRegistry';
import type { SportQuestionnaireConfig } from '../../sport/questionnaires/types';
import { ApiError } from '../../utils/ApiError';
import { PROFILE_SELECT_FIELDS } from '../../utils/constants';
import { isQuestionnaireEngineEnabled } from '../../utils/multisportQuestionnaireFlags';
import {
  clampSportLevel,
  MIN_SPORT_LEVEL,
  parseSportParam,
  resolveUserSportSnapshot,
} from './userSportProfile.service';

export type SportQuestionnaireStatus = {
  completed: boolean;
  skipped: boolean;
  suggested: boolean;
  level: number;
  gamesPlayed: number;
};

function getQuestionnaireConfig(sport: Sport): SportQuestionnaireConfig | undefined {
  return getSportConfig(sport).questionnaire;
}

export function rejectSocialLevelInQuestionnaireBody(body: unknown): void {
  if (body && typeof body === 'object' && body !== null && 'socialLevel' in body) {
    throw new ApiError(400, 'socialLevel cannot be changed via sport questionnaire');
  }
}

function validateAnswersForSport(sport: Sport, answers: unknown): string[] {
  const config = getQuestionnaireConfig(sport);
  if (!config) {
    throw new ApiError(400, 'No questionnaire available for this sport');
  }
  try {
    if (sport === Sport.PADEL) {
      return validatePadelQuestionnaireAnswers(answers);
    }
    return validateAnswers(answers, config.minQuestions);
  } catch (e) {
    throw new ApiError(400, e instanceof Error ? e.message : 'Invalid answers');
  }
}

function assertQuestionnaireApiEnabled(): void {
  if (!isQuestionnaireEngineEnabled()) {
    throw new ApiError(403, 'Sport questionnaire is not enabled');
  }
}

export async function getSportQuestionnaireStatus(
  userId: string,
  sportInput: unknown,
): Promise<SportQuestionnaireStatus> {
  const sport = parseSportParam(sportInput);
  assertQuestionnaireApiEnabled();
  const questionnaire = getQuestionnaireConfig(sport);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      sportProfiles: {
        where: { sport },
        select: {
          sport: true,
          level: true,
          reliability: true,
          gamesPlayed: true,
          gamesWon: true,
          questionnaireCompletedAt: true,
          questionnaireSkippedAt: true,
        },
      },
    },
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const profile = user.sportProfiles[0];
  const snapshot = resolveUserSportSnapshot(user, sport);

  const completed = !!profile?.questionnaireCompletedAt;
  const skipped = !!profile?.questionnaireSkippedAt;
  const suggested =
    !!questionnaire &&
    isQuestionnaireSuggestedForProfile(sport, profile) &&
    snapshot.gamesPlayed === 0;

  return {
    completed,
    skipped,
    suggested,
    level: snapshot.level,
    gamesPlayed: snapshot.gamesPlayed,
  };
}

export async function completeSportQuestionnaire(
  userId: string,
  sportInput: unknown,
  answers: unknown,
  _body?: Record<string, unknown>,
): Promise<SportQuestionnaireStatus> {
  const sport = parseSportParam(sportInput);
  assertQuestionnaireApiEnabled();
  rejectSocialLevelInQuestionnaireBody(_body);
  const qConfig = getQuestionnaireConfig(sport);
  if (!qConfig) {
    throw new ApiError(400, 'No questionnaire available for this sport');
  }

  const validatedAnswers = validateAnswersForSport(sport, answers);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      welcomeScreenPassed: true,
      sportProfiles: {
        where: { sport },
        select: {
          sport: true,
          level: true,
          reliability: true,
          gamesPlayed: true,
          gamesWon: true,
          questionnaireCompletedAt: true,
        },
      },
    },
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const profile = user.sportProfiles[0];
  const snapshot = resolveUserSportSnapshot(user, sport);

  if (snapshot.gamesPlayed > 0) {
    throw new ApiError(400, 'Level is locked by match results');
  }
  if (profile?.questionnaireCompletedAt) {
    throw new ApiError(400, 'Questionnaire already completed for this sport');
  }
  if (sport === Sport.PADEL && user.welcomeScreenPassed) {
    throw new ApiError(400, 'Welcome screen already completed');
  }

  const totalScore = sumAnswerScores(validatedAnswers);

  const newLevel = clampSportLevel(qConfig.scoreToLevel(totalScore));
  const levelBefore = snapshot.level;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.userSportProfile.upsert({
      where: { userId_sport: { userId, sport } },
      create: {
        userId,
        sport,
        level: newLevel,
        levelSource: SportLevelSource.QUESTIONNAIRE,
        questionnaireCompletedAt: now,
        questionnaireVersion: qConfig.id,
        questionnaireSkippedAt: null,
      },
      update: {
        level: newLevel,
        levelSource: SportLevelSource.QUESTIONNAIRE,
        questionnaireCompletedAt: now,
        questionnaireVersion: qConfig.id,
        questionnaireSkippedAt: null,
      },
    });

    await tx.levelChangeEvent.create({
      data: {
        userId,
        levelBefore,
        levelAfter: newLevel,
        eventType: LevelChangeEventType.QUESTIONNAIRE,
        sport,
        gameId: null,
        linkEntityType: null,
      },
    });

    if (sport === Sport.PADEL) {
      await tx.user.update({
        where: { id: userId },
        data: { welcomeScreenPassed: true },
      });
    }
  });

  console.log('[questionnaire] Completed', { userId, sport, levelAfter: newLevel });
  return getSportQuestionnaireStatus(userId, sport);
}

export async function skipSportQuestionnaire(
  userId: string,
  sportInput: unknown,
  _body?: Record<string, unknown>,
): Promise<SportQuestionnaireStatus> {
  const sport = parseSportParam(sportInput);
  assertQuestionnaireApiEnabled();
  rejectSocialLevelInQuestionnaireBody(_body);
  if (!getQuestionnaireConfig(sport)) {
    throw new ApiError(400, 'No questionnaire available for this sport');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      welcomeScreenPassed: true,
      sportProfiles: {
        where: { sport },
        select: { questionnaireCompletedAt: true, questionnaireSkippedAt: true },
      },
    },
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const profile = user.sportProfiles[0];
  if (profile?.questionnaireCompletedAt) {
    throw new ApiError(400, 'Questionnaire already completed for this sport');
  }
  if (sport === Sport.PADEL && user.welcomeScreenPassed) {
    throw new ApiError(400, 'Welcome screen already completed');
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.userSportProfile.upsert({
      where: { userId_sport: { userId, sport } },
      create: {
        userId,
        sport,
        questionnaireSkippedAt: now,
      },
      update: {
        questionnaireSkippedAt: now,
      },
    });

    if (sport === Sport.PADEL) {
      await tx.user.update({
        where: { id: userId },
        data: { welcomeScreenPassed: true },
      });
    }
  });

  return getSportQuestionnaireStatus(userId, sport);
}

export async function resetSportQuestionnaire(userId: string, sportInput: unknown) {
  const sport = parseSportParam(sportInput);
  assertQuestionnaireApiEnabled();

  const profile = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId, sport } },
    select: { gamesPlayed: true },
  });
  if (profile && profile.gamesPlayed > 0) {
    throw new ApiError(400, 'Cannot reset questionnaire after rated games');
  }

  const user = await prisma.$transaction(async (tx) => {
    await tx.levelChangeEvent.deleteMany({
      where: {
        userId,
        sport,
        eventType: LevelChangeEventType.QUESTIONNAIRE,
        gameId: null,
      },
    });
    await tx.userSportProfile.upsert({
      where: { userId_sport: { userId, sport } },
      create: {
        userId,
        sport,
        level: MIN_SPORT_LEVEL,
        levelSource: SportLevelSource.DEFAULT,
      },
      update: {
        level: MIN_SPORT_LEVEL,
        levelSource: SportLevelSource.DEFAULT,
        questionnaireCompletedAt: null,
        questionnaireSkippedAt: null,
        questionnaireVersion: null,
      },
    });

    if (sport === Sport.PADEL) {
      await tx.user.update({
        where: { id: userId },
        data: { welcomeScreenPassed: false },
      });
    }

    const u = await tx.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT_FIELDS,
    });
    if (!u) throw new ApiError(404, 'User not found');
    return u;
  });

  return user;
}
