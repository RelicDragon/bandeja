import type { Game } from '@/types';

export function resolveGameWeatherQueryParams(game: Pick<Game, 'city' | 'club' | 'court' | 'startTime' | 'endTime'>): {
  cityId: string;
  startTime: string;
  endTime: string;
} | null {
  const cityId = game.city?.id ?? game.club?.cityId ?? game.court?.club?.cityId ?? null;

  if (!cityId || !game.startTime || !game.endTime) {
    return null;
  }

  return {
    cityId,
    startTime: game.startTime,
    endTime: game.endTime,
  };
}
