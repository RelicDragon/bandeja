import { Sport } from '@prisma/client';
import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { PROFILE_SELECT_FIELDS } from '../utils/constants';
import {
  completeSportQuestionnaire,
  resetSportQuestionnaire,
  skipSportQuestionnaire,
} from './user/sportQuestionnaire.service';

export async function completeWelcomeScreen(userId: string, answers: string[]) {
  await completeSportQuestionnaire(userId, Sport.PADEL, answers);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PROFILE_SELECT_FIELDS,
  });
  if (!user) throw new ApiError(404, 'User not found');
  return user;
}

export async function resetWelcomeScreen(userId: string) {
  return resetSportQuestionnaire(userId, Sport.PADEL);
}

export async function skipWelcomeScreen(userId: string) {
  await skipSportQuestionnaire(userId, Sport.PADEL);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PROFILE_SELECT_FIELDS,
  });
  if (!user) throw new ApiError(404, 'User not found');
  return user;
}
