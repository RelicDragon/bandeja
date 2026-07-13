import type { Club } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import { resolveBooktimeMyClubTimezone } from '@/components/booktime/booktimeBookingUtils';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { BooktimeClubBookingProvider } from './providers/BooktimeClubBookingProvider';
import { PadelooClient } from '@/integrations/padeloo/client';
import { getPadelooClient, hydratePadelooSession } from '@/integrations/padeloo/session';
import { PadelooClubBookingProvider } from './providers/PadelooClubBookingProvider';
import {
  getBooktimeCompanyId,
  getPadelooClubId,
  isBooktimeClub,
  isPadelooClub,
} from '@shared/clubIntegration';
import type { ClubBookingProvider } from './ClubBookingProvider';
import { PADELOO_BOOKING_DURATIONS } from '@/integrations/padeloo/config';

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

export async function createHydratedPadelooClubBookingProvider(
  club: Club,
  padelooClubId: number,
  durationMinutes: number = PADELOO_BOOKING_DURATIONS[0],
) {
  await hydratePadelooSession(club.id, padelooClubId);
  const client = getPadelooClient(club.id, padelooClubId);
  return new PadelooClubBookingProvider(club, padelooClubId, client, durationMinutes);
}

export function createScoutPadelooClubBookingProvider(
  club: Club,
  padelooClubId: number,
  durationMinutes: number = PADELOO_BOOKING_DURATIONS[0],
) {
  const client = new PadelooClient({ padelooClubId });
  return new PadelooClubBookingProvider(club, padelooClubId, client, durationMinutes);
}

export function createClubBookingProvider(
  club: Club,
  mode: 'hydrated' | 'scout',
  options?: { durationMinutes?: number },
): ClubBookingProvider | null {
  if (isBooktimeClub(club)) {
    const companyId = getBooktimeCompanyId(club);
    if (!companyId) return null;
    return mode === 'hydrated'
      ? null
      : createScoutBooktimeClubBookingProvider(club, companyId);
  }

  if (isPadelooClub(club)) {
    const padelooClubId = getPadelooClubId(club);
    if (padelooClubId == null) return null;
    const durationMinutes = options?.durationMinutes ?? PADELOO_BOOKING_DURATIONS[0];
    return createScoutPadelooClubBookingProvider(club, padelooClubId, durationMinutes);
  }

  return null;
}

export async function createHydratedClubBookingProvider(
  club: Club,
  options?: { durationMinutes?: number },
): Promise<ClubBookingProvider | null> {
  if (isBooktimeClub(club)) {
    const companyId = getBooktimeCompanyId(club);
    if (!companyId) return null;
    return createHydratedBooktimeClubBookingProvider(club, companyId);
  }

  if (isPadelooClub(club)) {
    const padelooClubId = getPadelooClubId(club);
    if (padelooClubId == null) return null;
    return createHydratedPadelooClubBookingProvider(
      club,
      padelooClubId,
      options?.durationMinutes,
    );
  }

  return null;
}
