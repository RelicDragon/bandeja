import type { GameFilters, ResolvedGameFilters } from '@/utils/gameFiltersStorage';
import { hasActiveFindEntityChip } from '@/utils/findEntityTypeChips';
import { shiftDayKey } from '@/utils/weatherDayGroups';

/**
 * PRD 363 — what the Find empty state offers as a next step.
 *
 * Two honest, one-tap actions: create a game on the day the screen is about,
 * and clear exactly the filters that can hide games. Pure; the section
 * resolves the state and the empty-state component only renders it.
 */

export type FindRecoveryFilters = Pick<
  ResolvedGameFilters,
  | 'gameFilter'
  | 'trainingFilter'
  | 'tournamentFilter'
  | 'leaguesFilter'
  | 'eventsFilter'
  | 'filterClubIds'
  | 'filterTimeStart'
  | 'filterTimeEnd'
  | 'filterLevelMin'
  | 'filterLevelMax'
  | 'filterAvailableSlots'
  | 'filterSuitableRating'
  | 'filterNoRating'
  | 'hideBarGames'
  | 'filterNoviceFriendly'
  | 'filterSport'
>;

export interface FindRecoveryState {
  view: 'calendar' | 'list';
  /** Calendar's selected day, `yyyy-MM-dd`; ignored in list view. */
  selectedDay: string | null;
  /** Today in the Home-city timezone. */
  todayKey: string;
  filters: FindRecoveryFilters;
}

export interface FindRecoveryActions {
  /** Day the create action prefills, `yyyy-MM-dd`. Never a past day. */
  createDay: string;
  /** True when at least one filter that narrows results is active. */
  canClearFilters: boolean;
}

/**
 * The exact patch "Clear filters" applies: every narrowing filter back to its
 * default. Day, view, the filters-panel open state and the admin-only
 * "show private games" (which widens, not narrows) are untouched.
 */
export const FIND_RECOVERY_CLEARED_FILTERS: Partial<GameFilters> = {
  gameFilter: false,
  trainingFilter: false,
  tournamentFilter: false,
  leaguesFilter: false,
  eventsFilter: false,
  filterClubIds: [],
  filterTimeStart: '00:00',
  filterTimeEnd: '24:00',
  filterLevelMin: 1.0,
  filterLevelMax: 7.0,
  filterAvailableSlots: false,
  filterSuitableRating: false,
  filterNoRating: false,
  hideBarGames: false,
  filterNoviceFriendly: false,
  filterSport: 'primary',
};

const LEVEL_EPSILON = 1e-6;

export function hasClearableFindFilters(filters: FindRecoveryFilters): boolean {
  return (
    hasActiveFindEntityChip(filters) ||
    filters.filterClubIds.length > 0 ||
    filters.filterTimeStart !== '00:00' ||
    filters.filterTimeEnd !== '24:00' ||
    filters.filterLevelMin > 1.0 + LEVEL_EPSILON ||
    filters.filterLevelMax < 7.0 - LEVEL_EPSILON ||
    filters.filterAvailableSlots ||
    filters.filterSuitableRating ||
    filters.filterNoRating ||
    filters.hideBarGames ||
    filters.filterNoviceFriendly ||
    filters.filterSport !== 'primary'
  );
}

/**
 * Calendar view: the selected day (for a Weekend shortcut that is already the
 * first weekend day), clamped to today so an empty past day never offers a
 * game in the past. List view shows everything from today on, so an empty
 * list means "nothing today either": offer tomorrow.
 */
export function resolveFindRecoveryCreateDay(
  state: Pick<FindRecoveryState, 'view' | 'selectedDay' | 'todayKey'>,
): string {
  if (state.view === 'list') return shiftDayKey(state.todayKey, 1);
  const day = state.selectedDay ?? state.todayKey;
  return day < state.todayKey ? state.todayKey : day;
}

export function resolveFindRecoveryActions(state: FindRecoveryState): FindRecoveryActions {
  return {
    createDay: resolveFindRecoveryCreateDay(state),
    canClearFilters: hasClearableFindFilters(state.filters),
  };
}

export type DayRelation = 'today' | 'tomorrow' | 'other';

/** Drives the create label: "today" / "tomorrow" / "on Thu 24 Sep". */
export function relateDayToToday(dayKey: string, todayKey: string): DayRelation {
  if (dayKey === todayKey) return 'today';
  if (dayKey === shiftDayKey(todayKey, 1)) return 'tomorrow';
  return 'other';
}

/**
 * The `startTime` the create flow receives for a prefilled day: local noon,
 * exactly what `headerStore.setCreateGameInitialDate` produces for the
 * calendar's own "+" action, so the wizard lands on the same default slot.
 */
export function createGameStartTimeForDay(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
}
