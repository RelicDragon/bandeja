import type { BookingSelectionLimits } from '@shared/gameBooking/computeBookingSelectionLimits';

export function resolveBookingSelectionAfterDeselect(
  currentIds: readonly string[],
  removedIds: readonly string[],
  limits: BookingSelectionLimits,
): string[] {
  const removed = new Set(removedIds);
  const nextIds = currentIds.filter((id) => !removed.has(id));
  if (nextIds.length === 0 || nextIds.length >= limits.min) return nextIds;
  return [];
}
