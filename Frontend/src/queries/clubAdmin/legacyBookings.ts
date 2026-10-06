import type { BookingItem } from '@shared/clubAdmin/contract';
import type { ClubAdminReservationItem } from '@/api/clubAdmin';
import type { BookingsFilters } from './keys';

/** Legacy `/reservations` row → console `BookingItem`. */
export function reservationToBooking(item: ClubAdminReservationItem): BookingItem {
  if (item.kind === 'hold') {
    return {
      id: `hold:${item.holdId}`,
      kind: 'hold',
      holdId: item.holdId,
      courtId: item.courtId,
      courtName: item.courtName,
      startTime: item.startTime,
      endTime: item.endTime,
      billing: null,
      seriesId: null,
      label: item.label,
      note: item.note,
      customerName: null,
      customerPhone: null,
    };
  }
  return {
    id: item.id.startsWith('game:') ? item.id : `game:${item.id}`,
    kind: 'game',
    gameId: item.gameId,
    courtId: item.courtId,
    courtName: item.courtName,
    startTime: item.startTime,
    endTime: item.endTime,
    billing: null,
    name: item.name,
    status: item.status,
    entityType: 'GAME',
    hasBookedCourt: item.hasBookedCourt,
    host: item.host,
    participantCount: item.participantCount,
    maxParticipants: null,
  };
}

function hostName(item: BookingItem): string {
  if (item.kind === 'game') return `${item.host.firstName ?? ''} ${item.host.lastName ?? ''} ${item.name ?? ''}`;
  if (item.kind === 'hold') return `${item.customerName ?? ''} ${item.note ?? ''} ${item.customerPhone ?? ''}`;
  return item.provider;
}

/** Client-side filtering for the legacy list (the server filters `/bookings` itself). */
export function matchesBookingFilters(item: BookingItem, f: BookingsFilters): boolean {
  if (f.courtId && item.courtId !== f.courtId) return false;
  if (f.kinds && f.kinds.length > 0 && !f.kinds.includes(item.kind)) return false;
  if (f.payment) {
    const status = item.billing?.status ?? null;
    if (f.payment === 'NONE' ? status !== null : status !== f.payment) return false;
  }
  const q = (f.q ?? '').trim().toLowerCase();
  if (q && !`${hostName(item)} ${item.courtName ?? ''}`.toLowerCase().includes(q)) return false;
  return true;
}
