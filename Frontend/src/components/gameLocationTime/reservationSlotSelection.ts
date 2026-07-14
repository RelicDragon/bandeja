/** Single reservation hour is only blocked when selection is already at max. */
export function isReservationSlotDimmed(selected: boolean, selectedCount: number, max: number): boolean {
  return !selected && selectedCount >= max;
}

/**
 * Legacy all-or-nothing adjacent-group policy (bug):
 * dimmed the entire 2h block when adding every hour would exceed max,
 * even if the user only needed one free hour inside it.
 */
export function isAdjacentGroupDimmedLegacyAllOrNothing(
  groupSelected: boolean,
  selectedCount: number,
  slotsToAdd: number,
  max: number,
): boolean {
  return !groupSelected && selectedCount + slotsToAdd > max;
}
