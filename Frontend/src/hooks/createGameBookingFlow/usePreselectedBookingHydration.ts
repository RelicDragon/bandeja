import { useEffect, useRef } from 'react';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { useBooktimeClubAuth } from '@/hooks/useBooktimeClubAuth';
import { useBooktimeUpcomingBookings } from '@/hooks/useBooktimeUpcomingBookings';

const inactiveClubPlaceholder: Club = {
  id: '',
  name: '',
  address: '',
  cityId: '',
  integrationType: 'BOOKTIME',
};

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function orderedBookingRecords(
  ids: readonly string[],
  bookings: readonly BooktimeBookingRecord[],
): BooktimeBookingRecord[] {
  const byId = new Map(bookings.map((booking) => [booking.uuid, booking]));
  return ids
    .map((id) => byId.get(id))
    .filter((booking): booking is BooktimeBookingRecord => booking != null);
}

export function resolvePreselectedBookingHydration(
  initialBookingIds: readonly string[],
  bookings: readonly BooktimeBookingRecord[],
  loading: boolean,
): { ready: boolean; records: BooktimeBookingRecord[] } {
  if (loading || initialBookingIds.length === 0) {
    return { ready: false, records: [] };
  }
  const records = orderedBookingRecords(initialBookingIds, bookings);
  if (records.length < initialBookingIds.length) {
    return { ready: false, records: [] };
  }
  return { ready: true, records };
}

export function usePreselectedBookingHydration({
  initialBookingIds,
  selectedBookingIds,
  selectedBookingRecords,
  club,
  companyId,
  matchCourts,
  enabled,
  onHydrated,
}: {
  initialBookingIds: readonly string[];
  selectedBookingIds: readonly string[];
  selectedBookingRecords: readonly BooktimeBookingRecord[];
  club: Club | undefined;
  companyId: string | undefined;
  matchCourts: Court[];
  enabled: boolean;
  onHydrated: (ids: string[], records: BooktimeBookingRecord[]) => void;
}): { hydrating: boolean } {
  const hydratedRef = useRef(false);
  const active =
    enabled &&
    initialBookingIds.length > 0 &&
    club != null &&
    Boolean(companyId);

  const { status: auth } = useBooktimeClubAuth(club?.id, active);
  const connected = Boolean(auth?.connected);
  const { bookings, loading } = useBooktimeUpcomingBookings(
    club ?? inactiveClubPlaceholder,
    companyId ?? '',
    connected,
    active,
    matchCourts,
  );

  const initialBookingIdsKey = initialBookingIds.join(',');

  useEffect(() => {
    hydratedRef.current = false;
  }, [initialBookingIdsKey]);

  useEffect(() => {
    if (!active) return;
    if (selectedBookingIds.length === 0) return;
    if (hydratedRef.current) return;
    if (
      selectedBookingRecords.length >= selectedBookingIds.length &&
      selectedBookingIds.length > 0
    ) {
      hydratedRef.current = true;
      return;
    }

    if (loading) return;

    const { ready, records } = resolvePreselectedBookingHydration(
      initialBookingIds,
      bookings,
      false,
    );
    if (!ready) return;

    hydratedRef.current = true;
    onHydrated(
      records.map((record) => record.uuid),
      records,
    );
  }, [
    active,
    loading,
    bookings,
    initialBookingIds,
    selectedBookingIds.length,
    selectedBookingRecords.length,
    onHydrated,
  ]);

  const pendingInitialHydration =
    active &&
    initialBookingIds.length > 0 &&
    selectedBookingIds.length > 0 &&
    areStringArraysEqual(selectedBookingIds, initialBookingIds) &&
    selectedBookingRecords.length < initialBookingIds.length;

  const hydrating = pendingInitialHydration && loading;

  return { hydrating };
}
