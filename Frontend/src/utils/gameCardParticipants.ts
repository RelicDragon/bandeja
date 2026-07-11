import type { GameParticipant } from '@/types';

export function getPlayingParticipants(participants: readonly GameParticipant[]): GameParticipant[] {
  return participants.filter((p) => p.status === 'PLAYING');
}

/** Stable key for memoization — includes fields that affect carousel / capacity UI. */
export function playingParticipantsKey(participants: readonly GameParticipant[]): string {
  return getPlayingParticipants(participants)
    .map((p) => {
      const u = p.user;
      return [
        p.userId,
        p.role,
        p.status,
        u?.avatar ?? '',
        u?.firstName ?? '',
        u?.lastName ?? '',
        u?.gender ?? '',
        u?.isPremium ? '1' : '0',
        u?.isTrainer ? '1' : '0',
      ].join(':');
    })
    .join('|');
}

/** Layout-only key for carousel scroll listeners (participant order + count). */
export function participantsLayoutKey(participants: readonly GameParticipant[]): string {
  return participants.map((p) => p.userId).join(',');
}

/** Visual key for memoized carousel rows (avatars, names, roles). */
export function participantsRenderKey(participants: readonly GameParticipant[]): string {
  return participants
    .map((p) => {
      const u = p.user;
      return [
        p.userId,
        p.role,
        p.status,
        u?.avatar ?? '',
        u?.firstName ?? '',
        u?.lastName ?? '',
        u?.gender ?? '',
      ].join(':');
    })
    .join('|');
}
