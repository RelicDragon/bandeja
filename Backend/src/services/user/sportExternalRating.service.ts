import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  normalizeExternalRatingHint,
  sportSupportsExternalRatingHint,
} from '../../utils/sportRating';
import {
  assertSportImplemented,
  loadProfileUser,
  parseSportParam,
} from './userSportProfile.service';

export async function updateSportExternalRatingHint(
  userId: string,
  sportInput: unknown,
  hintInput: unknown,
) {
  const sport = parseSportParam(sportInput);
  assertSportImplemented(sport);

  if (!sportSupportsExternalRatingHint(sport)) {
    throw new ApiError(400, 'This sport does not support an external rating hint');
  }

  let externalRatingHint: string | null;
  try {
    externalRatingHint = normalizeExternalRatingHint(hintInput);
  } catch (err) {
    throw new ApiError(400, err instanceof Error ? err.message : 'Invalid external rating hint');
  }

  const profile = await prisma.userSportProfile.findUnique({
    where: { userId_sport: { userId, sport } },
    select: { id: true },
  });
  if (!profile) {
    throw new ApiError(404, 'Sport profile not found');
  }

  await prisma.userSportProfile.update({
    where: { userId_sport: { userId, sport } },
    data: { externalRatingHint },
  });

  return loadProfileUser(userId);
}
