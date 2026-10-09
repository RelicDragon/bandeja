/**
 * The organizer's own reservations at the club on a day, ready to link
 * (`OwnClubBooking`), so a court that is busy at the club can be checked
 * instead of asked about. `null` while there is nothing to check against:
 * no integration, account not connected, or still loading.
 *
 * Same data as "Link my reservation" (`GameCourtLinkSheet`): the provider's
 * upcoming list filtered to the date, minus reservations already linked here.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Club, Court, Game } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { buildLinkBookingRequest } from '@shared/gameBooking/linkBookingToGame';
import { clubToBooktimeRow, resolveCourtForBooking } from '@/components/booktime/booktimeBookingUtils';
import { useClubDateReservations } from '@/components/gameLocationTime/useClubDateReservations';
import type { OwnClubBooking } from './clubBookingClaims';

export function useOwnClubBookings({
  game,
  club,
  courts,
  selectedDate,
  enabled,
}: {
  game: Game;
  club: Club | undefined;
  courts: readonly Court[];
  selectedDate: Date;
  enabled: boolean;
}): OwnClubBooking[] | null {
  const { t } = useTranslation();
  const matchCourts = useMemo(() => [...courts], [courts]);
  const reservations = useClubDateReservations({ club, selectedDate, enabled, matchCourts });
  const unknownCourt = t('club.booktime.unknownCourt');

  return useMemo(() => {
    // A failed lookup is "can't tell", never "none of yours" (that pushed booking another court).
    if (!enabled || !club || !reservations.connected || !reservations.bookingsLoaded || reservations.bookingsError) {
      return null;
    }
    return toOwnClubBookings(reservations.dateBookings, { game, club, courts: matchCourts, unknownCourt });
  }, [
    enabled,
    club,
    game,
    reservations.connected,
    reservations.bookingsLoaded,
    reservations.bookingsError,
    reservations.dateBookings,
    matchCourts,
    unknownCourt,
  ]);
}

/** Provider records → linkable own bookings: not linked to this game yet, with a known court and times. */
export function toOwnClubBookings(
  records: readonly BooktimeBookingRecord[],
  { game, club, courts, unknownCourt }: { game: Game; club: Club; courts: readonly Court[]; unknownCourt: string },
): OwnClubBooking[] {
  // The loaded courts carry the club system's ids; a club from a list may have courts without them.
  const clubRow = clubToBooktimeRow(courts.length > 0 ? { ...club, courts: [...courts] } : club);
  const timeZone = club.city?.timezone ?? game.city?.timezone ?? null;
  const linked = new Set((game.linkedBookings ?? []).map((l) => l.externalBookingId));
  const out: OwnClubBooking[] = [];
  for (const record of records) {
    if (linked.has(record.uuid)) continue;
    const court = resolveCourtForBooking(record, clubRow, unknownCourt);
    if (!court.courtId) continue;
    try {
      const { externalBookingId, snapshot } = buildLinkBookingRequest(game, record, clubRow, {
        courtId: court.courtId,
        timeZone,
        skipGameDatetimePatch: true,
      });
      if (!snapshot.bookingStart || !snapshot.bookingEnd) continue;
      out.push({
        externalBookingId,
        courtId: court.courtId,
        start: snapshot.bookingStart,
        end: snapshot.bookingEnd,
        body: { externalBookingId, snapshot },
      });
    } catch {
      /* a reservation without usable times cannot be linked */
    }
  }
  return out;
}

export type OwnUpcomingClubBookings =
  | { state: 'off' | 'loading' | 'failed' }
  | { state: 'connect' }
  | { state: 'ready'; bookings: OwnClubBooking[] };

/**
 * Every upcoming booking of the organizer's at the club (any day) that this
 * game does not use yet, soonest first: "Use a booking I already made" in
 * Edit → When and where. `connect` = the club has a booking system the
 * organizer's account is not connected to.
 */
export function useOwnUpcomingClubBookings({
  game,
  club,
  courts,
  enabled,
}: {
  game: Game;
  club: Club | undefined;
  courts: readonly Court[];
  enabled: boolean;
}): OwnUpcomingClubBookings {
  const { t } = useTranslation();
  const matchCourts = useMemo(() => [...courts], [courts]);
  const today = useMemo(() => new Date(), []);
  const reservations = useClubDateReservations({ club, selectedDate: today, enabled, matchCourts });
  const unknownCourt = t('club.booktime.unknownCourt');

  return useMemo((): OwnUpcomingClubBookings => {
    if (!enabled || !club || !clubHasBookingIntegration(club)) return { state: 'off' };
    if (reservations.authLoading) return { state: 'loading' };
    if (reservations.auth != null && !reservations.connected) return { state: 'connect' };
    if (!reservations.connected) return { state: 'off' };
    if (reservations.bookingsError) return { state: 'failed' };
    if (!reservations.bookingsLoaded) return { state: 'loading' };
    const now = Date.now();
    const bookings = toOwnClubBookings(reservations.bookings, { game, club, courts: matchCourts, unknownCourt })
      .filter((b) => Date.parse(b.end) > now)
      .sort((a, b) => a.start.localeCompare(b.start));
    return { state: 'ready', bookings };
  }, [
    enabled,
    club,
    game,
    reservations.authLoading,
    reservations.auth,
    reservations.connected,
    reservations.bookingsError,
    reservations.bookingsLoaded,
    reservations.bookings,
    matchCourts,
    unknownCourt,
  ]);
}
