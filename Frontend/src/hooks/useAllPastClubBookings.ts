import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';
import { connectedClubRowToBooktimeRow } from '@/hooks/connectedBookingClubs';
import type { PadelooMyClubRow } from '@/api/padeloo';
import { useBooktimeAllPast } from '@/hooks/useBooktimeAllPast';
import { loadPadelooPastForClubs } from '@/integrations/padeloo/padelooAllPastLoader';
import { booktimeBookingStartMs } from '@/integrations/booktime/localTime';

export type AggregatedPastClubBooking = {
  uuid: string;
  bookingStart: string;
  bookingEnd: string;
  clubId: string;
  clubName: string;
  integrationType: 'BOOKTIME' | 'PADELOO';
  price?: number;
  status?: string;
  bookingResourceId?: string;
};

function toPadelooRows(clubs: ConnectedBookingClubRow[]): PadelooMyClubRow[] {
  return clubs
    .filter((club) => club.integrationType === 'PADELOO' && club.connected && club.padelooClubId)
    .map((club) => ({
      clubId: club.clubId,
      clubName: club.clubName,
      avatar: club.avatar,
      padelooClubId: club.padelooClubId ?? null,
      connected: club.connected,
      email: club.email ?? null,
      scoutOptIn: club.scoutOptIn,
      cityTimezone: club.cityTimezone,
      courts: club.courts,
    }));
}

export function useAllPastClubBookings(
  clubs: ConnectedBookingClubRow[],
  enabled: boolean,
  refreshKey = 0,
) {
  const booktimeRows = useMemo(
    () =>
      clubs
        .filter((c) => c.integrationType === 'BOOKTIME' && c.connected && c.companyId)
        .map(connectedClubRowToBooktimeRow),
    [clubs],
  );
  const padelooRows = useMemo(() => toPadelooRows(clubs), [clubs]);
  const { bookings: booktimePast, loading: booktimeLoading } = useBooktimeAllPast(
    booktimeRows,
    enabled && booktimeRows.length > 0,
    refreshKey,
  );
  const [padelooPast, setPadelooPast] = useState<AggregatedPastClubBooking[]>([]);
  const [padelooLoading, setPadelooLoading] = useState(false);

  const reloadPadeloo = useCallback(async () => {
    if (!enabled || padelooRows.length === 0) {
      setPadelooPast([]);
      setPadelooLoading(false);
      return;
    }
    setPadelooLoading(true);
    try {
      const rows = await loadPadelooPastForClubs(padelooRows);
      setPadelooPast(
        rows.map((row) => ({
          uuid: row.uuid,
          bookingStart: row.bookingStart,
          bookingEnd: row.bookingEnd,
          clubId: row.clubId,
          clubName: row.clubName,
          integrationType: 'PADELOO' as const,
          price: row.price,
          status: row.status,
          bookingResourceId: row.bookingResourceId,
        })),
      );
    } finally {
      setPadelooLoading(false);
    }
  }, [enabled, padelooRows]);

  useEffect(() => {
    void reloadPadeloo();
  }, [reloadPadeloo, refreshKey]);

  const bookings = useMemo(() => {
    const merged: AggregatedPastClubBooking[] = [
      ...booktimePast.map((row) => ({
        uuid: row.uuid,
        bookingStart: row.bookingStart,
        bookingEnd: row.bookingEnd,
        clubId: row.clubId,
        clubName: row.clubName,
        integrationType: 'BOOKTIME' as const,
        price: row.price,
        status: row.status,
        bookingResourceId: row.bookingResourceId,
      })),
      ...padelooPast,
    ];
    merged.sort((a, b) => booktimeBookingStartMs(b.bookingStart) - booktimeBookingStartMs(a.bookingStart));
    return merged;
  }, [booktimePast, padelooPast]);

  return {
    bookings,
    loading: booktimeLoading || padelooLoading,
  };
}
