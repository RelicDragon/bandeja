import type { BookingKind, BookingScope, ChargeStatus } from '@shared/clubAdmin/contract';

export interface BookingsFilters {
  scope: BookingScope;
  courtId?: string | null;
  kinds?: BookingKind[];
  payment?: ChargeStatus | 'NONE' | null;
  q?: string;
}

/** Stable, order-independent cache identity for a bookings filter set. */
export function bookingsFilterKey(f: BookingsFilters): string {
  const kinds = [...(f.kinds ?? [])].sort().join('+') || 'all';
  return [f.scope, f.courtId || 'all', kinds, f.payment || 'any', (f.q ?? '').trim().toLowerCase()].join('|');
}

/**
 * Club admin console cache keys. Everything is under `['clubAdmin']`; everything for one club is
 * under `['clubAdmin', 'club', clubId]`, so a club can be dropped or refreshed as one prefix.
 */
export const clubAdminKeys = {
  all: ['clubAdmin'] as const,
  clubs: (q: string) => ['clubAdmin', 'clubs', q.trim().toLowerCase()] as const,
  clubsAll: ['clubAdmin', 'clubs'] as const,
  club: (clubId: string) => ['clubAdmin', 'club', clubId] as const,
  context: (clubId: string) => ['clubAdmin', 'club', clubId, 'context'] as const,
  legacyClub: (clubId: string) => ['clubAdmin', 'club', clubId, 'legacyClub'] as const,
  dashboard: (clubId: string, date: string) => ['clubAdmin', 'club', clubId, 'dashboard', date] as const,
  dashboardAll: (clubId: string) => ['clubAdmin', 'club', clubId, 'dashboard'] as const,
  schedule: (clubId: string, date: string) => ['clubAdmin', 'club', clubId, 'schedule', date] as const,
  scheduleAll: (clubId: string) => ['clubAdmin', 'club', clubId, 'schedule'] as const,
  bookings: (clubId: string, filters: BookingsFilters) =>
    ['clubAdmin', 'club', clubId, 'bookings', bookingsFilterKey(filters)] as const,
  bookingsAll: (clubId: string) => ['clubAdmin', 'club', clubId, 'bookings'] as const,
};
