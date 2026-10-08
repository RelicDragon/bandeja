import type { Game } from '@/types';

/** The viewer's relationship to the game, as the tile colour shows it. */
export type ChatListGameTone = 'playing' | 'invited' | 'queue' | 'neutral' | 'past';

export function getChatListGameTone(game: Game, userId: string | undefined, past: boolean): ChatListGameTone {
  if (past) return 'past';
  const mine = userId ? game.participants?.find((p) => p.userId === userId) : undefined;
  switch (mine?.status) {
    case 'PLAYING':
      return 'playing';
    case 'INVITED':
      return 'invited';
    case 'IN_QUEUE':
      return 'queue';
    default:
      return 'neutral';
  }
}
