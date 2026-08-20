export const PLAYING_SLOT_STATUS = 'PLAYING' as const;

export type RosterParticipant = {
  status?: string | null;
};

export type RosterFullGame = {
  entityType?: string | null;
  maxParticipants?: number | null;
  participants?: ReadonlyArray<RosterParticipant> | null;
  status?: string | null;
};

export type InboxInviteLike = {
  status?: string | null;
  expiresAt?: Date | string | null;
  inviteExpiresAt?: Date | string | null;
  game?: RosterFullGame | null;
};

export function countPlayingParticipants(
  participants: ReadonlyArray<RosterParticipant> | null | undefined,
): number {
  if (!participants?.length) return 0;
  let count = 0;
  for (const participant of participants) {
    if (participant.status === PLAYING_SLOT_STATUS) count += 1;
  }
  return count;
}

export function isPlayingRosterFull(game: RosterFullGame): boolean {
  if (game.entityType === 'BAR') return false;
  const max = game.maxParticipants;
  if (max == null || max <= 0) return false;
  return countPlayingParticipants(game.participants) >= max;
}

export function didPlayingSlotOpen(input: {
  entityType?: string | null;
  maxParticipants?: number | null;
  playingCountBefore: number;
  playingCountAfter: number;
}): boolean {
  if (input.entityType === 'BAR') return false;
  const max = input.maxParticipants;
  if (max == null || max <= 0) return false;
  return input.playingCountBefore >= max && input.playingCountAfter < max;
}

export function isInviteExpiryActive(
  expiresAt: Date | string | null | undefined,
  now: Date,
): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > now.getTime();
}

export function isEndedGameStatus(status: string | null | undefined): boolean {
  return status === 'FINISHED' || status === 'ARCHIVED';
}

export function isInviteInboxVisible(
  invite: InboxInviteLike,
  now: Date = new Date(),
): boolean {
  const status = invite.status;
  if (status != null && status !== 'INVITED' && status !== 'PENDING') return false;
  const expiresAt = invite.expiresAt ?? invite.inviteExpiresAt;
  if (!isInviteExpiryActive(expiresAt, now)) return false;
  if (!invite.game) return true;
  if (isEndedGameStatus(invite.game.status)) return false;
  return !isPlayingRosterFull(invite.game);
}

export function filterInboxVisibleInvites<T extends InboxInviteLike>(
  invites: T[],
  now: Date = new Date(),
): T[] {
  return invites.filter((invite) => isInviteInboxVisible(invite, now));
}

export function pendingInvitesForSlotOpenNotify<T extends InboxInviteLike>(input: {
  entityType?: string | null;
  maxParticipants?: number | null;
  playingCountAfter: number;
  playingRemovedCount: number;
  pending: T[];
  now?: Date;
}): T[] {
  if (input.playingRemovedCount <= 0) return [];
  const opened = didPlayingSlotOpen({
    entityType: input.entityType,
    maxParticipants: input.maxParticipants,
    playingCountBefore: input.playingCountAfter + input.playingRemovedCount,
    playingCountAfter: input.playingCountAfter,
  });
  if (!opened) return [];
  return filterInboxVisibleInvites(input.pending, input.now ?? new Date());
}
