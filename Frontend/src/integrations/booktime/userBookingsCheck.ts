import { weltnerApi } from '@/api/weltner';
import type { ClubIntegrationType } from '@shared/clubIntegration';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';

export type UserBooktimeBookingIdsResult = {
  authenticated: boolean;
  ids: Set<string>;
};

export async function fetchUserBooktimeBookingIds(
  clubId: string,
  companyId: string,
  clubTimeZone?: string | null,
): Promise<UserBooktimeBookingIdsResult> {
  await hydrateBooktimeSession(clubId, companyId, clubTimeZone);
  const client = getBooktimeClient(clubId, companyId, clubTimeZone);
  if (!client.isAuthenticated) {
    return { authenticated: false, ids: new Set() };
  }
  const [upcoming, previous] = await Promise.all([
    client.getUpcomingBookings(0, 50),
    client.getPreviousBookings(0, 50),
  ]);
  const ids = new Set(
    [...(upcoming.bookings ?? []), ...(previous.bookings ?? [])].map((b) => b.uuid),
  );
  return { authenticated: true, ids };
}

/** Weltner ownership comes from Bandeja receipts, never a provider verification. */
export async function fetchUserClubBookingIds(
  clubId: string,
  companyId: string | null | undefined,
  integrationType?: ClubIntegrationType,
): Promise<UserBooktimeBookingIdsResult> {
  if (integrationType === 'WELTNER') {
    const receipts = await weltnerApi.bookings(clubId);
    return {
      authenticated: true,
      ids: new Set(receipts.filter((receipt) => receipt.state === 'CONFIRMED').map((receipt) => receipt.externalBookingId)),
    };
  }
  if (!companyId) return { authenticated: false, ids: new Set() };
  return fetchUserBooktimeBookingIds(clubId, companyId);
}
