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

export function resolveEditBookingUnlinks(args: {
  initialLinkedIds: string[];
  pendingRemoveBookingIds: string[];
  selectedBookingIds: string[];
  bookingsMode: boolean;
  bookFlowBookingIds?: string[];
}): string[] {
  const base = computePendingBookingUnlinks(
    args.initialLinkedIds,
    args.pendingRemoveBookingIds,
    args.selectedBookingIds,
    args.bookingsMode,
  );
  if (!args.bookFlowBookingIds?.length) return base;

  const keep = new Set(args.bookFlowBookingIds);
  const bookFlowRemoves = args.initialLinkedIds.filter((id) => !keep.has(id));
  return [...new Set([...base, ...bookFlowRemoves])];
}
