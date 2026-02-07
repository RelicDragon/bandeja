import type { GameParticipant } from '@/types';

export function isParticipantPlaying(p: GameParticipant): boolean {
  return p.status === 'PLAYING';
}

export function isParticipantCountsTowardSlots(
  p: GameParticipant,
  entityType?: string
): boolean {
  if (entityType === 'TRAINING' && p.isTrainer) return false;
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
