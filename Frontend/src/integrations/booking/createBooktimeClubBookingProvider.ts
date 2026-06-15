import type { Club } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import { resolveBooktimeMyClubTimezone } from '@/components/booktime/booktimeBookingUtils';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { BooktimeClubBookingProvider } from './providers/BooktimeClubBookingProvider';

export async function createHydratedBooktimeClubBookingProvider(club: Club, companyId: string) {
  const clubTimeZone = resolveBooktimeMyClubTimezone(club);
  await hydrateBooktimeSession(club.id, companyId, clubTimeZone);
  const client = getBooktimeClient(club.id, companyId, clubTimeZone);
  return new BooktimeClubBookingProvider(club, companyId, client);
}

export function createScoutBooktimeClubBookingProvider(club: Club, companyId: string) {
  const client = new BooktimeClient({
    companyId,
    clubTimeZone: resolveBooktimeMyClubTimezone(club),
  });
  return new BooktimeClubBookingProvider(club, companyId, client);
}
