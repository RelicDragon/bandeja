import { ClubIntegrationType } from '@prisma/client';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import type { RollbackBookingResult } from '../../shared/booking';
import { getExternalBookingProvider } from '../booking/getExternalBookingProvider';

export type BooktimeRollbackResult = RollbackBookingResult;

export async function rollbackBooktimeBookingsOnCreateFailure(
  userId: string,
  clubId: string,
  externalBookingIds: string[],
): Promise<BooktimeRollbackResult[]> {
  const provider = getExternalBookingProvider(ClubIntegrationType.BOOKTIME);
  if (!provider) {
    return externalBookingIds.map((id) => ({
      externalBookingId: id.trim(),
      attempted: false,
      cancelled: false,
      error: BOOKING_ERROR_KEYS.providerNotConfigured,
    }));
  }
  return provider.rollbackBookings(userId, clubId, externalBookingIds);
}
