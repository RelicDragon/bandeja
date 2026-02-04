import type { GameParticipant } from '@/types';

export function isParticipantPlaying(p: GameParticipant): boolean {
  return p.status === 'PLAYING';
}

export function isParticipantInQueue(p: GameParticipant): boolean {
  return p.status === 'IN_QUEUE';
}

export function isParticipantInvited(p: GameParticipant): boolean {
  return p.status === 'INVITED';
}

export function isParticipantGuest(p: GameParticipant): boolean {
  return p.status === 'GUEST';
}
