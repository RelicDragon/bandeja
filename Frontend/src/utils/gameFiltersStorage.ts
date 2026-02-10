import { get, set } from 'idb-keyval';

const GAME_FILTERS_KEY = 'padelpulse-game-filters';
const ONE_HOUR_MS = 60 * 60 * 1000;

export interface GameFilters {
  userFilter: boolean;
  gameFilter?: boolean;
  trainingFilter: boolean;
  tournamentFilter: boolean;
  leaguesFilter: boolean;
  activeTab: 'calendar' | 'list';
  listViewStartDate?: string;
  calendarSelectedDate?: string;
  dateSavedAt?: number;
}

const DEFAULT_FILTERS: GameFilters = {
  userFilter: false,
  gameFilter: false,
  trainingFilter: false,
  tournamentFilter: false,
  leaguesFilter: false,
  activeTab: 'calendar',
};

export const getGameFilters = async (): Promise<GameFilters> => {
  const filters = await get<GameFilters>(GAME_FILTERS_KEY);
  const now = Date.now();
  
  if (filters?.dateSavedAt && (now - filters.dateSavedAt) < ONE_HOUR_MS) {
    return {
      ...DEFAULT_FILTERS,
      ...filters,
      activeTab: filters?.activeTab || 'calendar',
    };
  }
  
  return {
    ...DEFAULT_FILTERS,
    ...filters,
    activeTab: filters?.activeTab || 'calendar',
    listViewStartDate: undefined,
    calendarSelectedDate: undefined,
    dateSavedAt: undefined,
  };
};

export const setGameFilters = async (filters: GameFilters): Promise<void> => {
  const filtersToSave: GameFilters = {
    ...filters,
    dateSavedAt: (filters.listViewStartDate || filters.calendarSelectedDate) ? Date.now() : undefined,
  };
  await set(GAME_FILTERS_KEY, filtersToSave);
};

