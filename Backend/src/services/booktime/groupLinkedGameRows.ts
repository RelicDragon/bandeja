export type LinkedGameSummary = {
  id: string;
  name: string | null;
  startTime: Date;
  endTime: Date;
  timeIsSet: boolean;
  status: string;
  linkBookingStart: Date | null;
  linkBookingEnd: Date | null;
};

export type LinkedGameLinkRow = {
  externalBookingId: string;
  bookingStart: Date | null;
  bookingEnd: Date | null;
  game: {
    id: string;
    name: string | null;
    startTime: Date;
    endTime: Date;
    timeIsSet: boolean;
    status: string;
  };
};

export function groupLinkedGameRows(
  rows: LinkedGameLinkRow[],
  requestedIds: string[],
): Record<string, LinkedGameSummary[]> {
  const grouped: Record<string, LinkedGameSummary[]> = {};
  for (const id of requestedIds) grouped[id] = [];
  for (const row of rows) {
    const list = grouped[row.externalBookingId] ?? (grouped[row.externalBookingId] = []);
    list.push({
      ...row.game,
      linkBookingStart: row.bookingStart,
      linkBookingEnd: row.bookingEnd,
    });
  }
  return grouped;
}
