import api from './axios';
import type { ApiResponse } from '@/types';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';

/** A booking made through Bandeja at an NS Padel club (local receipt; the club has no list API). */
export type NspadelReceipt = {
  externalBookingId: string;
  referenceType: 'LOCAL_RECEIPT';
  courtId: string | null;
  externalCourtId: string;
  bookingStart: string;
  bookingEnd: string;
  state: 'CONFIRMED';
};

export const nspadelApi = {
  /** NS Padel clubs where the user has bookings, as connected-club rows (no account to connect). */
  getBookingClubs: async () =>
    (await api.get<ApiResponse<{ clubs: ConnectedBookingClubRow[] }>>('/nspadel/booking-clubs')).data,
  bookings: async (clubId: string) =>
    (await api.get<ApiResponse<NspadelReceipt[]>>(`/nspadel/clubs/${encodeURIComponent(clubId)}/bookings`)).data.data ?? [],
};
