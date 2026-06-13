import prisma from '../../../config/database';
import { decryptToken } from '../../../utils/tokenEncryption';
import { cancelBooktimeBookingForUser, resolveBooktimeCompanyId } from '../../booktime/booktimeApi.client';
import { BooktimeImportCourtsService } from '../../admin/booktimeImportCourts.service';
import type { ExternalBookingProvider } from '../ExternalBookingProvider';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import type { RollbackBookingResult } from '../../../shared/booking';

type RollbackDeps = {
  resolveCompanyId: (clubId: string) => Promise<string | null>;
  findAuth: (
    userId: string,
    clubId: string,
  ) => Promise<{ id: string; accessToken: string; refreshToken: string } | null>;
  cancelBooking: (
    authId: string,
    companyId: string,
    tokens: { accessToken: string; refreshToken: string },
    bookingId: string,
  ) => Promise<void>;
  decrypt: (token: string) => string;
};

const defaultDeps: RollbackDeps = {
  resolveCompanyId: resolveBooktimeCompanyId,
  findAuth: async (userId, clubId) =>
    prisma.userClubBooktimeAuth.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { id: true, accessToken: true, refreshToken: true },
    }),
  cancelBooking: cancelBooktimeBookingForUser,
  decrypt: decryptToken,
};

async function cancelOneBooking(
  userId: string,
  clubId: string,
  externalBookingId: string,
  deps: RollbackDeps,
): Promise<RollbackBookingResult> {
  const bookingId = externalBookingId.trim();
  if (!bookingId || !clubId) {
    return { externalBookingId: bookingId, attempted: false, cancelled: false };
  }

  const companyId = await deps.resolveCompanyId(clubId);
  if (!companyId) {
    return {
      externalBookingId: bookingId,
      attempted: true,
      cancelled: false,
      error: BOOKING_ERROR_KEYS.configNotFound,
    };
  }

  const auth = await deps.findAuth(userId, clubId);
  if (!auth) {
    return {
      externalBookingId: bookingId,
      attempted: true,
      cancelled: false,
      error: BOOKING_ERROR_KEYS.connectionNotFound,
    };
  }

  try {
    await deps.cancelBooking(
      auth.id,
      companyId,
      {
        accessToken: deps.decrypt(auth.accessToken),
        refreshToken: deps.decrypt(auth.refreshToken),
      },
      bookingId,
    );
    return { externalBookingId: bookingId, attempted: true, cancelled: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : BOOKING_ERROR_KEYS.cancelFailed;
    console.error('[booktime] rollback cancel failed', { userId, clubId, bookingId, message });
    return { externalBookingId: bookingId, attempted: true, cancelled: false, error: message };
  }
}

export class BooktimeExternalBookingProvider implements ExternalBookingProvider {
  constructor(private readonly deps: RollbackDeps = defaultDeps) {}

  async rollbackBookings(
    userId: string,
    clubId: string,
    externalBookingIds: string[],
  ): Promise<RollbackBookingResult[]> {
    const ids = Array.from(
      new Set(externalBookingIds.map((id) => id.trim()).filter((id) => id.length > 0)),
    );
    const results: RollbackBookingResult[] = [];
    for (const id of ids) {
      results.push(await cancelOneBooking(userId, clubId, id, this.deps));
    }
    return results;
  }

  async importCourts(clubId: string) {
    return BooktimeImportCourtsService.importCourts(clubId);
  }
}

export const booktimeExternalBookingProvider = new BooktimeExternalBookingProvider();
