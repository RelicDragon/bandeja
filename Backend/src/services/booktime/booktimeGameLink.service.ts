import prisma from '../../config/database';

export type LinkedGameSummary = {
  id: string;
  name: string | null;
  startTime: Date;
  status: string;
};

export async function findLinkedGameForUser(
  userId: string,
  externalBookingId: string
): Promise<LinkedGameSummary | null> {
  const trimmed = externalBookingId.trim();
  if (!trimmed) return null;

  const game = await prisma.game.findFirst({
    where: {
      externalBookingId: trimmed,
      participants: {
        some: {
          userId,
          role: 'OWNER',
        },
      },
    },
    select: {
      id: true,
      name: true,
      startTime: true,
      status: true,
    },
  });

  return game;
}
