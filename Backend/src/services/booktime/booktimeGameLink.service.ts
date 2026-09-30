import { ParticipantRole, ParticipantStatus, type Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  groupLinkedGameRows,
  type LinkedGameSummary,
} from './groupLinkedGameRows';

export type { LinkedGameSummary } from './groupLinkedGameRows';

/** Who is asking. Provider booking ids are guessable, so results are always viewer-scoped. */
export type LinkedGamesViewer = {
  userId: string;
  isAdmin: boolean;
};

/** Same roster statuses `hasParentGamePermission` treats as "on the game". */
const ROSTER_STATUSES: ParticipantStatus[] = [
  ParticipantStatus.PLAYING,
  ParticipantStatus.NON_PLAYING,
  ParticipantStatus.IN_QUEUE,
];

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

/**
 * Games a viewer may see through the linked-games lookup: on the game's roster (any role),
 * or OWNER/ADMIN of the parent (league season → fixture, mirroring `canEditGame`).
 * Global admins see everything. Invited-only / uninvolved users see nothing.
 */
export function linkedGameViewerWhere(viewer: LinkedGamesViewer): Prisma.GameWhereInput | undefined {
  if (viewer.isAdmin) return undefined;
  return {
    OR: [
      { participants: { some: { userId: viewer.userId, status: { in: ROSTER_STATUSES } } } },
      {
        parent: {
          participants: {
            some: {
              userId: viewer.userId,
              role: { in: [ParticipantRole.OWNER, ParticipantRole.ADMIN] },
              status: { in: ROSTER_STATUSES },
            },
          },
        },
      },
    ],
  };
}

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
  viewer: LinkedGamesViewer,
): Promise<Record<string, LinkedGameSummary[]>> {
  const ids = uniqueTrimmedIds(externalBookingIds);
  if (ids.length === 0) return {};

  const gameWhere = linkedGameViewerWhere(viewer);
  const links = await prisma.gameExternalBooking.findMany({
    where: {
      externalBookingId: { in: ids },
      ...(gameWhere ? { game: gameWhere } : {}),
    },
    select: LINKED_GAME_SELECT,
    orderBy: { createdAt: 'asc' },
  });

  return groupLinkedGameRows(links, ids);
}

export async function findLinkedGamesForBooking(
  externalBookingId: string,
  viewer: LinkedGamesViewer,
): Promise<LinkedGameSummary[]> {
  const grouped = await findLinkedGamesForBookings([externalBookingId], viewer);
  const trimmed = externalBookingId.trim();
  return grouped[trimmed] ?? [];
}
