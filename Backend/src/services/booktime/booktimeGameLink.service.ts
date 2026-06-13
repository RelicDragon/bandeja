import prisma from '../../config/database';

export type LinkedGameSummary = {
  id: string;
  name: string | null;
  startTime: Date;
  status: string;
};

export async function findLinkedGamesForBooking(
  externalBookingId: string,
): Promise<LinkedGameSummary[]> {
  const trimmed = externalBookingId.trim();
  if (!trimmed) return [];

  const links = await prisma.gameExternalBooking.findMany({
    where: { externalBookingId: trimmed },
    select: {
      game: {
        select: {
          id: true,
          name: true,
          startTime: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return links.map((link) => link.game);
}
