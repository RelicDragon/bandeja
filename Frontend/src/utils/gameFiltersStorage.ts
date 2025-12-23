import { get, set } from 'idb-keyval';

const GAME_FILTERS_KEY = 'padelpulse-game-filters';

export interface GameFilters {
  filterByLevel: boolean;
  filterByAvailableSlots: boolean;
}

const DEFAULT_FILTERS: GameFilters = {
  filterByLevel: false,
  filterByAvailableSlots: false,
};

export const getGameFilters = async (): Promise<GameFilters> => {
  const filters = await get<GameFilters>(GAME_FILTERS_KEY);
  return filters || DEFAULT_FILTERS;
};

export const setGameFilters = async (filters: GameFilters): Promise<void> => {
  await set(GAME_FILTERS_KEY, filters);
};

