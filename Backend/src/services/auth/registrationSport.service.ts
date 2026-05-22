import { Sport, SportLevelSource, Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { MIN_SPORT_LEVEL, parseSportParam } from '../user/userSportProfile.service';

/** Registration `primarySport`: implemented sport only; default PADEL for legacy clients. */
export function parseRegistrationPrimarySport(input: unknown): Sport {
  if (input === undefined || input === null || input === '') {
    return Sport.PADEL;
  }
  try {
    return parseSportParam(input);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, 'Invalid primarySport');
  }
}

function sportProfileCreate(sport: Sport): Prisma.UserSportProfileCreateWithoutUserInput {
  return {
    sport,
    level: MIN_SPORT_LEVEL,
    reliability: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    levelSource: SportLevelSource.DEFAULT,
  };
}

export function registrationSportExplicitlyChosen(input: unknown): boolean {
  return input !== undefined && input !== null && input !== '';
}

/** Nested `sportProfiles.create` + `primarySport` / `sportsEnabled` for `prisma.user.create`. */
export function registrationSportUserFields(
  primarySport: Sport,
  options?: { primarySportIsSet?: boolean },
): {
  primarySport: Sport;
  sportsEnabled: Sport[];
  primarySportIsSet: boolean;
  sportProfiles: { create: Prisma.UserSportProfileCreateWithoutUserInput };
} {
  return {
    primarySport,
    sportsEnabled: [primarySport],
    primarySportIsSet: options?.primarySportIsSet ?? false,
    sportProfiles: {
      create: sportProfileCreate(primarySport),
    },
  };
}
