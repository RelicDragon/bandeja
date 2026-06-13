import { ParticipantRole } from '@prisma/client';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';

export const GAME_BOOKING_LINK_ROLES: ParticipantRole[] = [
  ParticipantRole.OWNER,
  ParticipantRole.ADMIN,
];

export async function canMutateGameBookings(
  gameId: string,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  return hasParentGamePermission(gameId, userId, GAME_BOOKING_LINK_ROLES, isAdmin);
}
