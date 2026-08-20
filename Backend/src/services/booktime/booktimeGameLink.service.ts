import prisma from '../../config/database';
import {
  groupLinkedGameRows,
  type LinkedGameSummary,
} from './groupLinkedGameRows';

export type { LinkedGameSummary } from './groupLinkedGameRows';

const LINKED_GAME_SELECT = {
  externalBookingId: true,
  bookingStart: true,
  bookingEnd: true,
  game: {
    select: {
      id: true,
      name: true,
      startTime: true,
      endTime: true,
      timeIsSet: true,
      status: true,
    },
  },
} as const;

function uniqueTrimmedIds(externalBookingIds: string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of externalBookingIds) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function findLinkedGamesForBookings(
  externalBookingIds: string[],
): Promise<Record<string, LinkedGameSummary[]>> {
  const ids = uniqueTrimmedIds(externalBookingIds);
  if (ids.length === 0) return {};

  const links = await prisma.gameExternalBooking.findMany({
    where: { externalBookingId: { in: ids } },
    select: LINKED_GAME_SELECT,
    orderBy: { createdAt: 'asc' },
  });

  return groupLinkedGameRows(links, ids);
}

export async function findLinkedGamesForBooking(
  externalBookingId: string,
): Promise<LinkedGameSummary[]> {
  const grouped = await findLinkedGamesForBookings([externalBookingId]);
  const trimmed = externalBookingId.trim();
  return grouped[trimmed] ?? [];
}
