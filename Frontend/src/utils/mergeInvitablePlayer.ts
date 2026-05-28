import type { BasicUser } from '@/types';
import type { InvitablePlayer } from '@/api/users';

/** Preserve full `sportProfiles` when a sport-scoped API response only returns projected `level`. */
export function mergeInvitablePlayer(
  existing: BasicUser | undefined,
  incoming: InvitablePlayer,
): InvitablePlayer {
  if (!existing) return incoming;

  const incomingProfiles = incoming.sportProfiles;
  const existingProfiles = existing.sportProfiles;
  const incomingHasProfiles = Array.isArray(incomingProfiles) && incomingProfiles.length > 0;
  const existingHasProfiles = Array.isArray(existingProfiles) && existingProfiles.length > 0;

  if (incomingHasProfiles || !existingHasProfiles) {
    return incoming;
  }

  const { level: _level, reliability: _reliability, ...incomingRest } = incoming;
  const sportsEnabled =
    incoming.sportsEnabled !== undefined ? incoming.sportsEnabled : existing.sportsEnabled;
  return {
    ...existing,
    ...incomingRest,
    sportProfiles: existingProfiles,
    ...(sportsEnabled !== undefined ? { sportsEnabled } : {}),
    interactionCount: incoming.interactionCount,
    gamesTogetherCount: incoming.gamesTogetherCount,
  };
}
