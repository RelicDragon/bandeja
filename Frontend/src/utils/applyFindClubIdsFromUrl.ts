import type { GameFilters } from '@/utils/gameFiltersStorage';

/**
 * PRD 354 — decide what `/find?clubIds=…` should do to the stored Find filters.
 *
 * Pure so the rule is testable without mounting the tab:
 *
 *  - Nothing in the URL → leave the user's saved filters alone. A plain `/find`
 *    must never wipe a club filter the player set by hand.
 *  - Ids in the URL that already match the saved filter → no update, so the
 *    effect does not loop.
 *  - Otherwise the URL wins, and the filters panel is opened so the player can
 *    see (and clear) the filter that arrived with the link.
 */
export function applyFindClubIdsFromUrl(
  urlClubIds: string[],
  filters: Pick<GameFilters, 'filterClubIds' | 'filtersPanelOpen'>,
): Partial<GameFilters> | null {
  if (urlClubIds.length === 0) return null;

  const current = filters.filterClubIds ?? [];
  const same =
    current.length === urlClubIds.length && urlClubIds.every((id) => current.includes(id));
  if (same && filters.filtersPanelOpen) return null;
  if (same) return { filtersPanelOpen: true };

  return { filterClubIds: urlClubIds, filtersPanelOpen: true };
}
