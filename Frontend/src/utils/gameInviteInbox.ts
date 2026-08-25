import type { Invite } from '@/types';

export const PLAYING_SLOT_STATUS = 'PLAYING' as const;
export const MIX_PAIRS_GENDER_TEAMS = 'MIX_PAIRS' as const;

export type RosterParticipant = {
  status?: string | null;
  userId?: string | null;
  gender?: string | null;
  user?: { gender?: string | null } | null;
};

export type RosterFullGame = {
  entityType?: string | null;
  genderTeams?: string | null;
  maxParticipants?: number | null;
  participants?: ReadonlyArray<RosterParticipant> | null;
  status?: string | null;
};

export type InboxInviteLike = {
  status?: string | null;
  expiresAt?: Date | string | null;
  inviteExpiresAt?: Date | string | null;
  receiverId?: string | null;
  userId?: string | null;
  gender?: string | null;
  receiver?: { gender?: string | null } | null;
  user?: { gender?: string | null } | null;
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

export function participantGender(participant: RosterParticipant): string | null {
  return participant.gender ?? participant.user?.gender ?? null;
}

export function inviteeGender(invite: InboxInviteLike): string | null {
  if (invite.gender) return invite.gender;
  if (invite.receiver?.gender) return invite.receiver.gender;
  if (invite.user?.gender) return invite.user.gender;
  const id = invite.receiverId ?? invite.userId;
  if (!id || !invite.game?.participants?.length) return null;
  for (const participant of invite.game.participants) {
    if (participant.userId === id) return participantGender(participant);
  }
  return null;
}

export function mixPairsMaxPerGender(maxParticipants: number | null | undefined): number {
  if (maxParticipants == null || maxParticipants <= 0) return 0;
  return Math.floor(maxParticipants / 2);
}

export function countPlayingParticipantsOfGender(
  participants: ReadonlyArray<RosterParticipant> | null | undefined,
  gender: string,
): number {
  if (!participants?.length) return 0;
  let count = 0;
  for (const participant of participants) {
    if (participant.status === PLAYING_SLOT_STATUS && participantGender(participant) === gender) {
      count += 1;
    }
  }
  return count;
}

export function isPlayingRosterFull(game: RosterFullGame): boolean {
  if (game.entityType === 'BAR') return false;
  const max = game.maxParticipants;
  if (max == null || max <= 0) return false;
  return countPlayingParticipants(game.participants) >= max;
}

export function isInvitePlaySlotFull(invite: InboxInviteLike): boolean {
  if (!invite.game) return false;
  if (isPlayingRosterFull(invite.game)) return true;
  if (invite.game.genderTeams !== MIX_PAIRS_GENDER_TEAMS) return false;
  const gender = inviteeGender(invite);
  if (gender !== 'MALE' && gender !== 'FEMALE') return false;
  const cap = mixPairsMaxPerGender(invite.game.maxParticipants);
  if (cap <= 0) return false;
  return countPlayingParticipantsOfGender(invite.game.participants, gender) >= cap;
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
  return !isInvitePlaySlotFull(invite);
}

export function filterInboxVisibleInvites(invites: Invite[], now?: Date): Invite[];
export function filterInboxVisibleInvites<T extends InboxInviteLike>(
  invites: T[],
  now?: Date,
): T[];
export function filterInboxVisibleInvites<T extends InboxInviteLike>(
  invites: T[],
  now: Date = new Date(),
): T[] {
  return invites.filter((invite) => isInviteInboxVisible(invite, now));
}

export function withExtraPlayingParticipants(
  game: RosterFullGame | null | undefined,
  extraCount: number,
  gender?: string | null,
): RosterFullGame | null | undefined {
  if (!game || extraCount <= 0) return game;
  const extra: RosterParticipant[] = Array.from({ length: extraCount }, () => ({
    status: PLAYING_SLOT_STATUS,
    gender: gender ?? undefined,
    user: gender ? { gender } : undefined,
  }));
  return {
    ...game,
    participants: [...(game.participants ?? []), ...extra],
  };
}

export function pendingInvitesForSlotOpenNotify<T extends InboxInviteLike>(input: {
  playingRemovedCount: number;
  openedGender?: string | null;
  pending: T[];
  now?: Date;
}): T[] {
  if (input.playingRemovedCount <= 0) return [];
  const now = input.now ?? new Date();
  return input.pending.filter((invite) => {
    if (!isInviteInboxVisible(invite, now)) return false;
    const previousGame = withExtraPlayingParticipants(
      invite.game,
      input.playingRemovedCount,
      input.openedGender,
    );
    return !isInviteInboxVisible({ ...invite, game: previousGame }, now);
  });
}
