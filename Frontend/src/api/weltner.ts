import { notifyBooktimeAllUpcomingCacheInvalidation } from '@/integrations/booktime/booktimeAllUpcomingCacheInvalidation';
import api from './axios';
import type { ApiResponse } from '@/types';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';

export type WeltnerReceipt = {
  externalBookingId: string;
  referenceType: 'LOCAL_RECEIPT';
  upstreamBookingId: string | null;
  courtId: string;
  bookingStart: string;
  bookingEnd: string;
  state: 'CONFIRMED' | 'SUBMITTING' | 'UNKNOWN';
};
export type WeltnerAvailability = {
  date: string;
  courts: Array<{
    courtId: string;
    externalCourtId: string;
    slots: Array<{ start: string; end: string; duration: number }>;
  }>;
};
const clubPath = (id: string) => `/weltner/clubs/${encodeURIComponent(id)}`;
export const weltnerApi = {
  getAuth: async (id: string) =>
    (
      await api.get<ApiResponse<{ connected: boolean; phoneNumber: string | null }>>(
        `${clubPath(id)}/auth`,
      )
    ).data,
  putAuth: async (id: string, phoneNumber: string) => {
    const response = await api.put(`${clubPath(id)}/auth`, { phoneNumber });
    notifyBooktimeAllUpcomingCacheInvalidation();
    return response.data;
  },
  deleteAuth: async (id: string) => {
    const response = await api.delete(`${clubPath(id)}/auth`);
    notifyBooktimeAllUpcomingCacheInvalidation();
    return response.data;
  },
  getMyClubs: async () =>
    (
      await api.get<
        ApiResponse<{
          cityWeltnerClubCount: number;
          clubs: ConnectedBookingClubRow[];
        }>
      >('/weltner/my-clubs')
    ).data,
  availability: async (id: string, date: string) =>
    (
      await api.get<ApiResponse<WeltnerAvailability>>(`${clubPath(id)}/availability`, {
        params: { date },
      })
    ).data.data!,
  bookings: async (id: string) =>
    (await api.get<ApiResponse<WeltnerReceipt[]>>(`${clubPath(id)}/bookings`)).data.data ?? [],
  book: async (
    id: string,
    body: {
      courtId: string;
      date: string;
      startTime: string;
      durationMinutes: number;
    },
  ) => {
    try {
      return (await api.post<ApiResponse<WeltnerReceipt>>(`${clubPath(id)}/bookings`, body)).data
        .data!;
    } finally {
      notifyBooktimeAllUpcomingCacheInvalidation();
    }
  },
};
