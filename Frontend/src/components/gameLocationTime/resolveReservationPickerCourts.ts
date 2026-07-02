import type { Court } from '@/types';

export function resolveReservationPickerCourts({
  selectedCourtIds,
  courts,
  bookingMatchCourts,
}: {
  selectedCourtIds: string[];
  courts: Court[];
  bookingMatchCourts?: Court[];
}): Court[] {
  const matchCourts = bookingMatchCourts ?? courts;
  if (selectedCourtIds.length === 0) return matchCourts;

  const byId = new Map([...matchCourts, ...courts].map((court) => [court.id, court]));
  const selectedCourts = selectedCourtIds
    .map((id) => byId.get(id))
    .filter((court): court is Court => court != null);

  return selectedCourts.length > 0 ? selectedCourts : matchCourts;
}
