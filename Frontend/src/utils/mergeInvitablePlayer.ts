import type { BasicUser } from '@/types';
import type { InvitablePlayer } from '@/api/users';

/** Preserve full `sportProfiles` when a sport-scoped API response only returns projected `level`. */
export function mergeInvitablePlayer(
  existing: BasicUser | undefined,
  incoming: InvitablePlayer,
): BasicUser {
  if (!existing) return incoming;

  const incomingProfiles = incoming.sportProfiles;
  const existingProfiles = existing.sportProfiles;
  const incomingHasProfiles = Array.isArray(incomingProfiles) && incomingProfiles.length > 0;
  const existingHasProfiles = Array.isArray(existingProfiles) && existingProfiles.length > 0;

  if (incomingHasProfiles || !existingHasProfiles) {
    return incoming;
  }

  const { level: _level, reliability: _reliability, gamesPlayed: _gp, gamesWon: _gw, ...incomingRest } =
    incoming;
  return {
    ...existing,
    ...incomingRest,
    sportProfiles: existingProfiles,
    interactionCount: incoming.interactionCount,
    gamesTogetherCount: incoming.gamesTogetherCount,
  };
}
