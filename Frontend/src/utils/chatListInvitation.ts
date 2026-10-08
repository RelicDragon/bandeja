import type { Game } from '@/types';

/** A pending game invite the viewer can still answer (Join / Decline) from the chat list. */
export function isChatListInvitation(game: Game, userId: string | undefined): boolean {
  if (!userId || game.status !== 'ANNOUNCED') return false;
  return game.participants?.some((p) => p.userId === userId && p.status === 'INVITED') ?? false;
}
