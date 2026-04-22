import type { Game } from '@/types';

export const PLAYOFF_GAME_TYPE_SEEDS: Record<'WINNER_COURT' | 'AMERICANO', Partial<Game>> = {
  WINNER_COURT: { gameType: 'WINNER_COURT' },
  AMERICANO: { gameType: 'AMERICANO' },
};
