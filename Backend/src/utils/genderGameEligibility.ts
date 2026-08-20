import { EntityType, Gender, GenderTeam } from '@prisma/client';

export const GENDER_UNSET_CODE = 'errors.games.genderUnset';
export const GENDER_UNSET_OTHER_MESSAGE = 'errors.games.genderUnsetOther';
export const GENDER_INCOMPATIBLE_CODE = 'errors.games.genderIncompatible';

export type GenderedGameLike = {
  genderTeams?: GenderTeam | string | null;
  entityType?: EntityType | string | null;
};

export type GenderEligibilityUser = {
  gender: Gender | string;
  genderIsSet: boolean;
};

export type GenderEligibilityResult =
  | { ok: true }
  | { ok: false; message: string; code: string };

export function isGenderedEvent(game: GenderedGameLike | null | undefined): boolean {
  if (!game) return false;
  if (game.entityType === EntityType.BAR || game.entityType === 'BAR') return false;
  const gt = game.genderTeams ?? GenderTeam.ANY;
  return gt === GenderTeam.MEN || gt === GenderTeam.WOMEN || gt === GenderTeam.MIX_PAIRS
    || gt === 'MEN' || gt === 'WOMEN' || gt === 'MIX_PAIRS';
}

export function evaluateGenderForGame(
  game: GenderedGameLike,
  user: GenderEligibilityUser,
  options?: { targetIsOtherUser?: boolean },
): GenderEligibilityResult {
  if (!isGenderedEvent(game)) return { ok: true };

  if (user.genderIsSet !== true) {
    return {
      ok: false,
      code: GENDER_UNSET_CODE,
      message: options?.targetIsOtherUser ? GENDER_UNSET_OTHER_MESSAGE : GENDER_UNSET_CODE,
    };
  }

  const gt = game.genderTeams;
  if (gt === GenderTeam.MEN || gt === 'MEN') {
    if (user.gender !== Gender.MALE && user.gender !== 'MALE') {
      return {
        ok: false,
        code: GENDER_INCOMPATIBLE_CODE,
        message: 'errors.games.genderIncompatibleMen',
      };
    }
    return { ok: true };
  }

  if (gt === GenderTeam.WOMEN || gt === 'WOMEN') {
    if (user.gender !== Gender.FEMALE && user.gender !== 'FEMALE') {
      return {
        ok: false,
        code: GENDER_INCOMPATIBLE_CODE,
        message: 'errors.games.genderIncompatibleWomen',
      };
    }
    return { ok: true };
  }

  if (gt === GenderTeam.MIX_PAIRS || gt === 'MIX_PAIRS') {
    const isBinary = user.gender === Gender.MALE
      || user.gender === Gender.FEMALE
      || user.gender === 'MALE'
      || user.gender === 'FEMALE';
    if (!isBinary) {
      return {
        ok: false,
        code: GENDER_INCOMPATIBLE_CODE,
        message: 'errors.games.genderIncompatibleMix',
      };
    }
  }

  return { ok: true };
}
