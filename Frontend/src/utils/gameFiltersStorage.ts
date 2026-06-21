import { get, set } from 'idb-keyval';
import type { Sport } from '@/sport/sportRegistry';

const GAME_FILTERS_KEY = 'padelpulse-game-filters';

/** Find discovery sport filter: primary = default (no API param), all = every sport, else a specific sport. */
export type FindSportFilterValue = 'primary' | 'all' | Sport;
const ONE_HOUR_MS = 60 * 60 * 1000;

export interface GameFilters {
  /** @deprecated Use filterAvailableSlots and filterSuitableRating. */
  userFilter?: boolean;
  filterAvailableSlots?: boolean;
  filterSuitableRating?: boolean;
  hideBarGames?: boolean;
  gameFilter?: boolean;
  trainingFilter: boolean;
  tournamentFilter: boolean;
  leaguesFilter: boolean;
  activeTab: 'calendar' | 'list';
  listViewStartDate?: string;
  calendarSelectedDate?: string;
  dateSavedAt?: number;
  filtersPanelOpen?: boolean;
  filterClubIds?: string[];
  filterTimeStart?: string;
  filterTimeEnd?: string;
  filterLevelMin?: number;
  filterLevelMax?: number;
  filterSport?: FindSportFilterValue;
  /** When true, only games with affectsRating === false. */
  filterNoRating?: boolean;
  /** Admin Find: include non-public games the viewer is not in. */
  showPrivateGames?: boolean;
}

const DEFAULT_FILTERS: GameFilters = {
  filterAvailableSlots: false,
  filterSuitableRating: false,
  hideBarGames: false,
  gameFilter: false,
  trainingFilter: false,
  tournamentFilter: false,
  leaguesFilter: false,
  activeTab: 'calendar',
  filtersPanelOpen: false,
  filterClubIds: [],
  filterTimeStart: '00:00',
  filterTimeEnd: '24:00',
  filterLevelMin: 1.0,
  filterLevelMax: 7.0,
};

function normalizeStoredFilters(filters: GameFilters | undefined): GameFilters {
  const merged = { ...DEFAULT_FILTERS, ...filters };
  if (filters?.userFilter && !filters.filterAvailableSlots && !filters.filterSuitableRating) {
    merged.filterAvailableSlots = true;
    merged.filterSuitableRating = true;
  }
  return merged;
}

export const getGameFilters = async (): Promise<GameFilters> => {
  const filters = await get<GameFilters>(GAME_FILTERS_KEY);
  const now = Date.now();
  
  if (filters?.dateSavedAt && (now - filters.dateSavedAt) < ONE_HOUR_MS) {
    return {
      ...normalizeStoredFilters(filters),
      activeTab: filters?.activeTab || 'calendar',
    };
  }
  
  return {
    ...normalizeStoredFilters(filters),
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

