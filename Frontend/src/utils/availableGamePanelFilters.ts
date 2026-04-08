import type { Game } from '@/types';
import { gameStartFallsInTimeRange } from '@/utils/gameListTimeFilter';

export interface AvailableGamePanelFilterState {
  filterClubIds: string[];
  filterTimeStart: string;
  filterTimeEnd: string;
  filterLevelMin: number;
  filterLevelMax: number;
}

export const DEFAULT_AVAILABLE_GAME_PANEL_FILTERS: AvailableGamePanelFilterState = {
  filterClubIds: [],
  filterTimeStart: '00:00',
  filterTimeEnd: '24:00',
  filterLevelMin: 1.0,
  filterLevelMax: 7.0,
};

export const getGameClubId = (game: Game): string | undefined =>
  game.clubId ?? game.club?.id ?? game.court?.clubId;

export const passesAvailableGamePanelFilters = (
  game: Game,
  p: AvailableGamePanelFilterState
): boolean => {
  if (p.filterClubIds.length > 0) {
    const cid = getGameClubId(game);
    if (!cid || !p.filterClubIds.includes(cid)) {
      return false;
    }
  }
  if (!(p.filterTimeStart === '00:00' && p.filterTimeEnd === '24:00')) {
    if (!gameStartFallsInTimeRange(game.startTime, p.filterTimeStart, p.filterTimeEnd)) {
      return false;
    }
  }
  const levelActive = p.filterLevelMin > 1.0 + 1e-6 || p.filterLevelMax < 7.0 - 1e-6;
  if (levelActive) {
    const gMin = game.minLevel ?? 1.0;
    const gMax = game.maxLevel ?? 7.0;
    if (gMax < p.filterLevelMin || gMin > p.filterLevelMax) {
      return false;
    }
  }
  return true;
};
