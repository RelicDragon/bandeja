import type { GameParticipant } from '@/types';
import { isPendingGameInvite } from '@/utils/gameInviteParticipant';

export function isParticipantPlaying(p: GameParticipant): boolean {
  return p.status === 'PLAYING';
}

export function isParticipantNonPlaying(p: GameParticipant): boolean {
  return p.status === 'NON_PLAYING';
}

export function isParticipantInQueue(p: GameParticipant): boolean {
  return p.status === 'IN_QUEUE';
}

export function isParticipantInvited(p: GameParticipant): boolean {
  return isPendingGameInvite(p);
}

export function isParticipantGuest(p: GameParticipant): boolean {
  return p.status === 'GUEST';
}
