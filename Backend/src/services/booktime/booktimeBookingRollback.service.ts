import prisma from '../../config/database';
import { decryptToken } from '../../utils/tokenEncryption';
import { cancelBooktimeBookingForUser, resolveBooktimeCompanyId } from './booktimeApi.client';

export type BooktimeRollbackResult = {
  externalBookingId: string;
  attempted: boolean;
  cancelled: boolean;
  error?: string;
};

async function cancelOneBooking(
  userId: string,
  clubId: string,
  externalBookingId: string,
): Promise<BooktimeRollbackResult> {
  const bookingId = externalBookingId.trim();
  if (!bookingId || !clubId) {
    return { externalBookingId: bookingId, attempted: false, cancelled: false };
  }

  const companyId = await resolveBooktimeCompanyId(clubId);
  if (!companyId) {
    return {
      externalBookingId: bookingId,
      attempted: true,
      cancelled: false,
      error: 'Club booking config not found',
    };
  }

  const auth = await prisma.userClubBooktimeAuth.findUnique({
    where: { userId_clubId: { userId, clubId } },
    select: { id: true, accessToken: true, refreshToken: true },
  });
  if (!auth) {
    return {
      externalBookingId: bookingId,
      attempted: true,
      cancelled: false,
      error: 'Club booking connection not found',
    };
  }

  try {
    await cancelBooktimeBookingForUser(
      auth.id,
      companyId,
      {
        accessToken: decryptToken(auth.accessToken),
        refreshToken: decryptToken(auth.refreshToken),
      },
      bookingId,
    );
    return { externalBookingId: bookingId, attempted: true, cancelled: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cancel booking failed';
    console.error('[booktime] rollback cancel failed', { userId, clubId, bookingId, message });
    return { externalBookingId: bookingId, attempted: true, cancelled: false, error: message };
  }
}

export async function rollbackBooktimeBookingsOnCreateFailure(
  userId: string,
  clubId: string,
  externalBookingIds: string[],
): Promise<BooktimeRollbackResult[]> {
  const ids = Array.from(
    new Set(externalBookingIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
  const results: BooktimeRollbackResult[] = [];
  for (const id of ids) {
    results.push(await cancelOneBooking(userId, clubId, id));
  }
  return results;
}
