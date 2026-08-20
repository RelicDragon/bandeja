import { useAuthStore } from '@/store/authStore';
import { useGenderJoinGateStore } from '@/store/genderJoinGateStore';
import { isGenderedEvent, type GenderedEventLike } from './isGenderedEvent';

export const GENDER_UNSET_CODE = 'errors.games.genderUnset';
export const GENDER_UNSET_OTHER_MESSAGE = 'errors.games.genderUnsetOther';
export const GENDER_INCOMPATIBLE_CODE = 'errors.games.genderIncompatible';

type GenderFlagUser = { genderIsSet?: boolean } | null | undefined;

function apiErrorPayload(error: unknown): { code?: string; message?: string } {
  const data = (error as { response?: { data?: { code?: string; message?: string } } })?.response?.data;
  if (!data || typeof data !== 'object') return {};
  return data;
}

export function needsGenderForEvent(game: GenderedEventLike | null | undefined, user: GenderFlagUser): boolean {
  return isGenderedEvent(game) && user?.genderIsSet !== true;
}

export type PushInviteGenderPayload = {
  gameId?: string;
  genderTeams?: string;
  entityType?: string;
};

export async function resolveGameLikeForPushInvite(
  payload: PushInviteGenderPayload | null | undefined,
  fetchGame: (gameId: string) => Promise<GenderedEventLike | null | undefined>,
): Promise<GenderedEventLike | null> {
  if (!payload) return null;
  if (payload.genderTeams) {
    return { genderTeams: payload.genderTeams, entityType: payload.entityType };
  }
  if (!payload.gameId) return null;
  try {
    const game = await fetchGame(payload.gameId);
    return game ?? null;
  } catch {
    return null;
  }
}

export function genderAddBlockReason(
  game: GenderedEventLike | null | undefined,
  target: GenderFlagUser,
): 'genderUnset' | null {
  if (!isGenderedEvent(game)) return null;
  if (target?.genderIsSet === true) return null;
  return 'genderUnset';
}

export function isSelfGenderUnsetError(error: unknown): boolean {
  const { code, message } = apiErrorPayload(error);
  if (message === GENDER_UNSET_OTHER_MESSAGE) return false;
  return code === GENDER_UNSET_CODE || message === GENDER_UNSET_CODE;
}

export function recoverGenderUnsetJoin(
  error: unknown,
  retry: () => void | Promise<void>,
): boolean {
  if (!isSelfGenderUnsetError(error)) return false;
  useGenderJoinGateStore.getState().openWithPending(retry);
  return true;
}

/** @returns false when the gender sheet opened and the action must wait. */
export function runWithGenderForEvent(
  game: GenderedEventLike | null | undefined,
  action: () => void | Promise<void>,
): boolean {
  const user = useAuthStore.getState().user;
  if (!user) return true;
  if (!needsGenderForEvent(game, user)) return true;
  useGenderJoinGateStore.getState().openWithPending(action);
  return false;
}
