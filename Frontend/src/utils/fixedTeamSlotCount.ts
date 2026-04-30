import type { Game } from '@/types';

/** Number of fixed pair slots for a game (2 players per slot). */
export function getFixedTeamSlotCount(game: Pick<Game, 'maxParticipants'>): number {
  const n = game.maxParticipants ?? 0;
  return Math.floor(n / 2);
}
