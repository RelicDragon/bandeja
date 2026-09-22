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
  eventsFilter?: boolean;
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
  /** PRD 360 — when true, only games the organizer tagged "Novices welcome". SQL, not residual. */
  filterNoviceFriendly?: boolean;
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
  eventsFilter: false,
  activeTab: 'calendar',
  filtersPanelOpen: false,
  filterClubIds: [],
  filterTimeStart: '00:00',
  filterTimeEnd: '24:00',
  filterLevelMin: 1.0,
  filterLevelMax: 7.0,
  filterNoviceFriendly: false,
};

/**
 * Every field the Find UI reads, with no optionals. The stored shape keeps most
 * fields optional for backward compatibility, which used to force each consumer
 * to repeat `filters.x ?? someDefault` at the point of use.
 */
export type ResolvedGameFilters = Required<
  Pick<
    GameFilters,
    | 'filterAvailableSlots' | 'filterSuitableRating' | 'hideBarGames' | 'gameFilter'
    | 'trainingFilter' | 'tournamentFilter' | 'leaguesFilter' | 'eventsFilter'
    | 'filtersPanelOpen' | 'filterClubIds' | 'filterTimeStart' | 'filterTimeEnd'
    | 'filterLevelMin' | 'filterLevelMax' | 'filterSport' | 'filterNoRating'
    | 'filterNoviceFriendly' | 'showPrivateGames'
  >
>;

export function resolveGameFilters(filters: GameFilters): ResolvedGameFilters {
  return {
    // `userFilter` is the pre-split flag; it still seeds both successors.
    filterAvailableSlots: filters.filterAvailableSlots ?? filters.userFilter ?? false,
    filterSuitableRating: filters.filterSuitableRating ?? filters.userFilter ?? false,
    hideBarGames: filters.hideBarGames ?? false,
    gameFilter: filters.gameFilter ?? false,
    trainingFilter: filters.trainingFilter ?? false,
    tournamentFilter: filters.tournamentFilter ?? false,
    leaguesFilter: filters.leaguesFilter ?? false,
    eventsFilter: filters.eventsFilter ?? false,
    filtersPanelOpen: filters.filtersPanelOpen ?? false,
    filterClubIds: filters.filterClubIds ?? [],
    filterTimeStart: filters.filterTimeStart ?? '00:00',
    filterTimeEnd: filters.filterTimeEnd ?? '24:00',
    filterLevelMin: filters.filterLevelMin ?? 1.0,
    filterLevelMax: filters.filterLevelMax ?? 7.0,
    filterSport: filters.filterSport ?? 'primary',
    filterNoRating: filters.filterNoRating ?? false,
    filterNoviceFriendly: filters.filterNoviceFriendly ?? false,
    showPrivateGames: filters.showPrivateGames ?? false,
  };
}

function normalizeStoredFilters(filters: GameFilters | undefined): GameFilters {
  const merged = { ...DEFAULT_FILTERS, ...filters };
  if (filters?.userFilter && !filters.filterAvailableSlots && !filters.filterSuitableRating) {
    merged.filterAvailableSlots = true;
    merged.filterSuitableRating = true;
  }
  return merged;
}

function withDateTtl(filters: GameFilters | undefined): GameFilters {
  const now = Date.now();
  if (filters?.dateSavedAt && now - filters.dateSavedAt < ONE_HOUR_MS) {
    return {
      ...normalizeStoredFilters(filters),
      activeTab: filters.activeTab || 'calendar',
    };
  }

  return {
    ...normalizeStoredFilters(filters),
    activeTab: filters?.activeTab || 'calendar',
    listViewStartDate: undefined,
    calendarSelectedDate: undefined,
    dateSavedAt: undefined,
  };
}

/** Sync mirror so Find remount (game → Back) keeps the last known total filter state. */
let memoryCache: GameFilters | null = null;

/** Latest-wins queue so a slow older write cannot overwrite a newer filter snapshot. */
let writeEpoch = 0;
let writeChain: Promise<void> = Promise.resolve();

/** Immediate read for SPA remounts; null on cold start before first load/save. */
export function peekGameFiltersMemory(): GameFilters | null {
  return memoryCache ? withDateTtl(memoryCache) : null;
}

export const getGameFilters = async (): Promise<GameFilters> => {
  await writeChain;
  if (memoryCache) {
    return withDateTtl(memoryCache);
  }
  const filters = await get<GameFilters>(GAME_FILTERS_KEY);
  memoryCache = filters ? { ...filters } : { ...DEFAULT_FILTERS };
  return withDateTtl(memoryCache);
};

export const setGameFilters = async (filters: GameFilters): Promise<void> => {
  const epoch = ++writeEpoch;
  const filtersToSave: GameFilters = {
    ...filters,
    dateSavedAt: filters.listViewStartDate || filters.calendarSelectedDate ? Date.now() : undefined,
  };
  memoryCache = filtersToSave;

  writeChain = writeChain.then(async () => {
    if (epoch !== writeEpoch) return;
    await set(GAME_FILTERS_KEY, filtersToSave);
  });

  await writeChain;
};

/** Test-only: drop in-memory mirror. */
export function resetGameFiltersMemoryCacheForTests(): void {
  memoryCache = null;
  writeEpoch = 0;
  writeChain = Promise.resolve();
}
