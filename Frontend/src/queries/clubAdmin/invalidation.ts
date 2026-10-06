import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { clubAdminKeys } from './keys';

/**
 * Everything a booking change (hold create/move/delete, game cancel/clear) can make stale:
 * every cached schedule day, every bookings list, the dashboard and the picker's
 * "bookings today" counts. Context, hours and courts are untouched.
 */
export function bookingChangeKeys(clubId: string): QueryKey[] {
  return [
    clubAdminKeys.scheduleAll(clubId),
    clubAdminKeys.bookingsAll(clubId),
    clubAdminKeys.dashboardAll(clubId),
    clubAdminKeys.clubsAll,
  ];
}

export function invalidateAfterBookingChange(qc: QueryClient, clubId: string): Promise<void> {
  return Promise.all(bookingChangeKeys(clubId).map((queryKey) => qc.invalidateQueries({ queryKey }))).then(
    () => undefined
  );
}

/** Club settings / courts changed: refresh context (setup checklist), schedule columns and the legacy club. */
export function invalidateAfterClubChange(qc: QueryClient, clubId: string): Promise<void> {
  return qc.invalidateQueries({ queryKey: clubAdminKeys.club(clubId) }).then(() =>
    qc.invalidateQueries({ queryKey: clubAdminKeys.clubsAll })
  );
}
