import { get, set } from 'idb-keyval';

const GAME_FILTERS_KEY = 'padelpulse-game-filters';

export interface GameFilters {
  userFilter: boolean;
  trainingFilter: boolean;
  activeTab: 'calendar' | 'list';
}

const DEFAULT_FILTERS: GameFilters = {
  userFilter: false,
  trainingFilter: false,
  activeTab: 'calendar',
};

export const getGameFilters = async (): Promise<GameFilters> => {
  const filters = await get<GameFilters>(GAME_FILTERS_KEY);
  return {
    ...DEFAULT_FILTERS,
    ...filters,
    activeTab: filters?.activeTab || 'calendar',
  };
};

export const setGameFilters = async (filters: GameFilters): Promise<void> => {
  await set(GAME_FILTERS_KEY, filters);
};

