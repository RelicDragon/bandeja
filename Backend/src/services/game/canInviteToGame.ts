import { ParticipantRole } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { hasParentGamePermission, hasRealParticipantStatus } from '../../utils/parentGamePermissions';

const REAL_STATUSES = new Set(['PLAYING', 'NON_PLAYING']);
const PERM_STATUSES = new Set(['PLAYING', 'NON_PLAYING', 'IN_QUEUE']);
const OWNER_ADMIN_ROLES = new Set(['OWNER', 'ADMIN']);
const PARTICIPANT_ROLES = new Set(['OWNER', 'ADMIN', 'PARTICIPANT']);

export function viewerCanInviteFromFacts(facts: {
  hasRealParticipantStatus: boolean;
  isOwnerOrAdmin: boolean;
  anyoneCanInvite: boolean;
  isParticipant: boolean;
}): boolean {
  if (!facts.hasRealParticipantStatus) return false;
  if (facts.isOwnerOrAdmin) return true;
  return facts.anyoneCanInvite && facts.isParticipant;
}

function hasRole(
  rows: Array<{ status: string; role: string }>,
  roles: Set<string>,
): boolean {
  return rows.some((row) => roles.has(row.role) && PERM_STATUSES.has(row.status));
}

export function viewerCanInviteFromLoadedGame(input: {
  viewerId: string;
  isAdmin: boolean;
  anyoneCanInvite: boolean;
  participants: Array<{ userId: string; status: string; role: string }>;
  parentParticipants?: Array<{ status: string; role: string }>;
}): boolean {
  const mine = input.participants.filter((p) => p.userId === input.viewerId);
  const parent = input.parentParticipants ?? [];
  const hasReal =
    mine.some((p) => REAL_STATUSES.has(p.status)) || parent.some((p) => REAL_STATUSES.has(p.status));
  const isOwnerOrAdmin =
    input.isAdmin || hasRole(mine, OWNER_ADMIN_ROLES) || hasRole(parent, OWNER_ADMIN_ROLES);
  const isParticipant =
    isOwnerOrAdmin || hasRole(mine, PARTICIPANT_ROLES) || hasRole(parent, PARTICIPANT_ROLES);
  return viewerCanInviteFromFacts({
    hasRealParticipantStatus: hasReal,
    isOwnerOrAdmin,
    anyoneCanInvite: input.anyoneCanInvite,
    isParticipant,
  });
}

export async function viewerCanInviteToGame(
  gameId: string,
  userId: string,
  isAdmin: boolean,
  anyoneCanInvite: boolean,
): Promise<boolean> {
  const [hasRealStatus, isOwnerOrAdmin] = await Promise.all([
    hasRealParticipantStatus(gameId, userId),
    hasParentGamePermission(gameId, userId, [ParticipantRole.OWNER, ParticipantRole.ADMIN], isAdmin),
  ]);
  if (!hasRealStatus) return false;
  if (isOwnerOrAdmin) return true;
  if (!anyoneCanInvite) return false;
  return hasParentGamePermission(
    gameId,
    userId,
    [ParticipantRole.OWNER, ParticipantRole.ADMIN, ParticipantRole.PARTICIPANT],
    isAdmin,
  );
}

export async function assertCanInviteToGame(
  gameId: string,
  userId: string,
  isAdmin: boolean,
  anyoneCanInvite: boolean,
): Promise<void> {
  const allowed = await viewerCanInviteToGame(gameId, userId, isAdmin, anyoneCanInvite);
  if (!allowed) {
    throw new ApiError(403, 'errors.invites.onlyParticipantsCanSend');
  }
}
