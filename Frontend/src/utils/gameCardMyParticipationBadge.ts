import type { GameParticipant } from '@/types';

export type GameCardMyParticipationBadge =
  | 'owner'
  | 'admin'
  | 'guest'
  | 'invited'
  | 'in_queue'
  | 'playing'
  | 'non_playing';

export function getGameCardMyParticipationBadge(
  participants: GameParticipant[] | undefined,
  userId: string | undefined
): GameCardMyParticipationBadge | null {
  if (!userId) return null;
  const row = participants?.find((p) => p.userId === userId);
  if (!row) return null;
  if (row.role === 'OWNER') return 'owner';
  if (row.role === 'ADMIN') return 'admin';
  if (row.role === 'PARTICIPANT' || row.role === 'GUEST') {
    switch (row.status) {
      case 'INVITED':
        return 'invited';
      case 'IN_QUEUE':
        return 'in_queue';
      case 'GUEST':
        return 'guest';
      case 'PLAYING':
        return 'playing';
      case 'NON_PLAYING':
        return 'non_playing';
      default:
        return null;
    }
  }
  return null;
}
