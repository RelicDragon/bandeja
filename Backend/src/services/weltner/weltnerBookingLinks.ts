import type { Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

/** Client snapshots are never evidence of a Weltner reservation. */
export async function weltnerBookingLinkData(
  tx: Prisma.TransactionClient,
  input: { gameId: string; userId?: string; externalBookingId: string },
) {
  if (!input.externalBookingId.startsWith('weltner:'))
    throw new ApiError(400, 'weltner.invalidReceipt');
  const receipt = await tx.weltnerBooking.findUnique({
    where: { id: input.externalBookingId.slice(8) },
  });
  const game = await tx.game.findUnique({
    where: { id: input.gameId },
    select: { clubId: true, court: { select: { clubId: true } } },
  });
  const clubId = game?.clubId ?? game?.court?.clubId;
  if (
    !receipt ||
    receipt.state !== 'CONFIRMED' ||
    receipt.clubId !== clubId ||
    (input.userId && receipt.userId !== input.userId)
  )
    throw new ApiError(403, 'weltner.invalidReceipt');
  return {
    courtId: receipt.courtId,
    bookingStart: receipt.bookingStart,
    bookingEnd: receipt.bookingEnd,
  };
}
