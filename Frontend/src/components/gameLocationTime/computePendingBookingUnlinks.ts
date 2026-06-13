export function computePendingBookingUnlinks(
  initialLinkedIds: string[],
  pendingRemoveBookingIds: string[],
  selectedBookingIds: string[],
  bookingsMode: boolean,
): string[] {
  const pickerRemoves = bookingsMode
    ? initialLinkedIds.filter((id) => !selectedBookingIds.includes(id))
    : [];
  return [
    ...new Set([
      ...pendingRemoveBookingIds.filter((id) => initialLinkedIds.includes(id)),
      ...pickerRemoves,
    ]),
  ];
}
