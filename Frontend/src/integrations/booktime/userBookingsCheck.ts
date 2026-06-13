import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';

export type UserBooktimeBookingIdsResult = {
  authenticated: boolean;
  ids: Set<string>;
};

export async function fetchUserBooktimeBookingIds(
  clubId: string,
  companyId: string,
): Promise<UserBooktimeBookingIdsResult> {
  await hydrateBooktimeSession(clubId, companyId);
  const client = getBooktimeClient(clubId, companyId);
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
