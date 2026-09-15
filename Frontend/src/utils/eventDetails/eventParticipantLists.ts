import type { GameParticipant } from '@/types';
import { isParticipantPlaying } from '@/utils/participantStatus';

export type EventViewerIntent = 'going' | 'looking' | null;

export function eventGoingParticipants(participants: GameParticipant[] | undefined): GameParticipant[] {
  return (participants ?? []).filter((p) => isParticipantPlaying(p));
}

export function eventLookingParticipants(participants: GameParticipant[] | undefined): GameParticipant[] {
  return (participants ?? []).filter((p) => p.lookingForPartner === true);
}

export function eventViewerIntent(
  participants: GameParticipant[] | undefined,
  userId: string | undefined,
): EventViewerIntent {
  if (!userId) return null;
  const mine = (participants ?? []).find((p) => p.userId === userId);
  if (!mine) return null;
  if (mine.lookingForPartner) return 'looking';
  if (isParticipantPlaying(mine)) return 'going';
  return null;
}

export function eventOwnerParticipant(participants: GameParticipant[] | undefined): GameParticipant | undefined {
  return (participants ?? []).find((p) => p.role === 'OWNER');
}
