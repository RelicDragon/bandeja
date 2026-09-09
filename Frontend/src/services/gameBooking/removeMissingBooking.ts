import { fetchLinkedGameIdsForBooking, unlinkBookingFromLinkedGames } from './unlinkBookingFromLinkedGames';
import { removeBooktimeBookingFromCache } from '@/integrations/booktime/booktimeAllUpcomingLoader';
import { invalidatePadelooUpcomingCache } from '@/integrations/padeloo/padelooAllUpcomingLoader';
import { invalidateKlikterenUpcomingCache } from '@/integrations/klikteren/klikterenAllUpcomingLoader';

/** Removes Bandeja's saved links and cache only; never cancels an external booking. */
export async function removeMissingBooking(externalBookingId: string): Promise<void> {
  const gameIds = await fetchLinkedGameIdsForBooking(externalBookingId);
  const removed = await unlinkBookingFromLinkedGames(externalBookingId, gameIds);
  if (removed.length !== gameIds.length) throw new Error('Some booking links could not be removed');
  await removeBooktimeBookingFromCache(externalBookingId);
  invalidatePadelooUpcomingCache();
  invalidateKlikterenUpcomingCache();
}
