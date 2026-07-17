import type { GameFilters } from '@/utils/gameFiltersStorage';

/** True when advanced Filters panel has non-default criteria (excludes panel open flag). */
export function hasFindPanelFiltersApplied(
  filters: Pick<
    GameFilters,
    | 'filterAvailableSlots'
    | 'filterSuitableRating'
    | 'hideBarGames'
    | 'userFilter'
    | 'filterClubIds'
    | 'filterTimeStart'
    | 'filterTimeEnd'
    | 'filterLevelMin'
    | 'filterLevelMax'
    | 'filterNoRating'
    | 'showPrivateGames'
  >,
): boolean {
  return (
    Boolean(filters.filterAvailableSlots) ||
    Boolean(filters.filterSuitableRating) ||
    Boolean(filters.hideBarGames) ||
    Boolean(filters.userFilter) ||
    (filters.filterClubIds?.length ?? 0) > 0 ||
    (filters.filterTimeStart ?? '00:00') !== '00:00' ||
    (filters.filterTimeEnd ?? '24:00') !== '24:00' ||
    (filters.filterLevelMin ?? 1.0) > 1.0 + 1e-6 ||
    (filters.filterLevelMax ?? 7.0) < 7.0 - 1e-6 ||
    Boolean(filters.filterNoRating) ||
    Boolean(filters.showPrivateGames)
  );
}
