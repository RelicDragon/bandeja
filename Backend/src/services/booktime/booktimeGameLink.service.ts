import prisma from '../../config/database';

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

export async function findLinkedGamesForBooking(
  externalBookingId: string,
): Promise<LinkedGameSummary[]> {
  const trimmed = externalBookingId.trim();
  if (!trimmed) return [];

  const links = await prisma.gameExternalBooking.findMany({
    where: { externalBookingId: trimmed },
    select: {
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
    },
    orderBy: { createdAt: 'asc' },
  });

  return links.map((link) => ({
    ...link.game,
    linkBookingStart: link.bookingStart,
    linkBookingEnd: link.bookingEnd,
  }));
}
