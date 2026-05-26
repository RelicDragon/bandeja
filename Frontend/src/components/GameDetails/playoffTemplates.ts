import type { Game } from '@/types';

export const PLAYOFF_GAME_TYPE_SEEDS: Record<'WINNER_COURT' | 'AMERICANO', Partial<Game>> = {
  WINNER_COURT: { gameType: 'WINNER_COURT' },
  AMERICANO: { gameType: 'AMERICANO' },
};

/** Playoff wizard defaults: season fixture format, with optional playoff game-type override. */
export function playoffFormatInitialFromSeason(
  seasonGame: Partial<Game> | null | undefined,
  overrides?: Partial<Game>
): Partial<Game> {
  return {
    maxParticipants: 4,
    ...(seasonGame ?? {}),
    ...overrides,
  };
}
