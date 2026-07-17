/** Returns pruned ids, or null when selection should be left unchanged. */
export function pruneFindFilterClubIds(
  clubIds: string[],
  allowedIds: ReadonlySet<string>,
  catalogsReady: boolean,
): string[] | null {
  if (!catalogsReady) return null;
  const next = clubIds.filter((id) => allowedIds.has(id));
  return next.length !== clubIds.length ? next : null;
}

/** Venue clubs + bars (bars omitted when hideBarGames). */
export function buildFindFilterAllowedClubIds(
  venueClubIds: readonly string[],
  barIds: readonly string[],
  hideBarGames: boolean,
): Set<string> {
  return new Set([...venueClubIds, ...(hideBarGames ? [] : barIds)]);
}
