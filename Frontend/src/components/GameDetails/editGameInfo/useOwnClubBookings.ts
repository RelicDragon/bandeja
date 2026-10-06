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
    if (!enabled || !club || !reservations.connected || !reservations.bookingsLoaded) return null;
    const clubRow = clubToBooktimeRow(club);
    const timeZone = club.city?.timezone ?? game.city?.timezone ?? null;
    const linked = new Set((game.linkedBookings ?? []).map((l) => l.externalBookingId));
    const out: OwnClubBooking[] = [];
    for (const record of reservations.dateBookings) {
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
  }, [enabled, club, game, reservations.connected, reservations.bookingsLoaded, reservations.dateBookings, unknownCourt]);
}
