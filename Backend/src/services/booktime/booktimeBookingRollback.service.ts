import prisma from '../../config/database';
import { decryptToken } from '../../utils/tokenEncryption';
import { cancelBooktimeBookingForUser, resolveBooktimeCompanyId } from './booktimeApi.client';

export type BooktimeRollbackResult = {
  attempted: boolean;
  cancelled: boolean;
  error?: string;
};

export async function rollbackBooktimeBookingOnCreateFailure(
  userId: string,
  clubId: string,
  externalBookingId: string
): Promise<BooktimeRollbackResult> {
  const bookingId = externalBookingId.trim();
  if (!bookingId || !clubId) {
    return { attempted: false, cancelled: false };
  }

  const companyId = await resolveBooktimeCompanyId(clubId);
  if (!companyId) {
    return { attempted: true, cancelled: false, error: 'Club booking config not found' };
  }

  const auth = await prisma.userClubBooktimeAuth.findUnique({
    where: { userId_clubId: { userId, clubId } },
    select: { id: true, accessToken: true, refreshToken: true },
  });
  if (!auth) {
    return { attempted: true, cancelled: false, error: 'Club booking connection not found' };
  }

  try {
    await cancelBooktimeBookingForUser(
      auth.id,
      companyId,
      {
        accessToken: decryptToken(auth.accessToken),
        refreshToken: decryptToken(auth.refreshToken),
      },
      bookingId
    );
    return { attempted: true, cancelled: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cancel booking failed';
    console.error('[booktime] rollback cancel failed', { userId, clubId, bookingId, message });
    return { attempted: true, cancelled: false, error: message };
  }
}
