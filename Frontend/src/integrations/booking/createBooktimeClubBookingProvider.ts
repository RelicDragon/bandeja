import type { Club } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { BooktimeClubBookingProvider } from './providers/BooktimeClubBookingProvider';

export async function createHydratedBooktimeClubBookingProvider(club: Club, companyId: string) {
  await hydrateBooktimeSession(club.id, companyId);
  const client = getBooktimeClient(club.id, companyId);
  return new BooktimeClubBookingProvider(club, companyId, client);
}

export function createScoutBooktimeClubBookingProvider(club: Club, companyId: string) {
  const client = new BooktimeClient({ companyId });
  return new BooktimeClubBookingProvider(club, companyId, client);
}
