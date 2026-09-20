/**
 * PRD 354 — public club page (`/clubs/:id`).
 *
 * These endpoints are guest-readable and deliberately narrower than
 * `clubsApi.getById`, which returns the raw `Club` row including
 * `integrationConfig`. The club page must never read from that shape: booking
 * capability arrives here as `booking.available` / `booking.provider` and
 * nothing more.
 */
import api from './axios';
import type { ApiResponse, City, ClubPhoto, Game, Sport } from '@/types';

export type PublicClubCourt = {
  id: string;
  name: string;
  sport: Sport | null;
  courtType: string | null;
  isIndoor: boolean;
  surfaceType: string | null;
  pricePerHour: number | null;
  webCameraUrl: string | null;
  integrationCourtName: string | null;
};

/** Capability, never configuration. `provider` carries no secret. */
export type PublicClubBooking = {
  available: boolean;
  provider: 'BOOKTIME' | 'PADELOO' | 'KLIKTEREN' | 'NSPADELSUPABASE' | null;
};

export type PublicClub = {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  photos: ClubPhoto[];
  carouselPhotos: ClubPhoto[];
  address: string;
  cityId: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  openingTime: string | null;
  closingTime: string | null;
  amenities: Record<string, unknown> | null;
  isBar: boolean;
  isForPlaying: boolean;
  sports: Sport[];
  clubRating: number | null;
  clubReviewCount: number;
  courtsNumber: number;
  defaultSlotMinutes: number | null;
  cancellationNoticeHours: number | null;
  policyText: string | null;
  city: Pick<City, 'id' | 'name' | 'country'> & { timezone: string };
  courts: PublicClubCourt[];
  booking: PublicClubBooking;
  isFavorite: boolean;
  isAdmin: boolean;
};

/**
 * Deliberately not `Pick<BasicUser, …>`: the regulars projection is a narrow
 * whitelist and carries no rating, so it must not be typed as a partial player.
 * The player card fetches the full profile when a face is tapped.
 */
export type ClubRegular = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  isPremium: boolean;
  showPremiumStatus: boolean;
  isTrainer: boolean;
  primarySport: Sport;
};

export type ClubTodayHour = { hour: number; busy: boolean };

export type ClubTodayCourt = {
  courtId: string;
  name: string;
  isIndoor: boolean;
  hours: ClubTodayHour[];
  freeHours: number;
};

export type ClubTodayAvailability = {
  date: string;
  timezone: string;
  openHour: number;
  closeHour: number;
  courts: ClubTodayCourt[];
  updatedAt: string | null;
};

export type ClubPublicGamesPayload = { games: Game[]; hasMore: boolean };

export const clubPublicApi = {
  getPublicClub: async (clubId: string): Promise<PublicClub> => {
    const response = await api.get<ApiResponse<PublicClub>>(`/clubs/${clubId}/public`);
    return response.data.data;
  },

  getRegulars: async (clubId: string): Promise<ClubRegular[]> => {
    const response = await api.get<ApiResponse<ClubRegular[]>>(`/clubs/${clubId}/regulars`);
    return response.data.data ?? [];
  },

  getUpcomingGames: async (clubId: string): Promise<ClubPublicGamesPayload> => {
    const response = await api.get<ApiResponse<Game[]> & { meta?: { hasMore?: boolean } }>(
      `/clubs/${clubId}/public-games`,
    );
    return {
      games: response.data.data ?? [],
      hasMore: Boolean(response.data.meta?.hasMore),
    };
  },

  getTodayAvailability: async (clubId: string): Promise<ClubTodayAvailability> => {
    const response = await api.get<ApiResponse<ClubTodayAvailability>>(
      `/clubs/${clubId}/today-availability`,
    );
    return response.data.data;
  },
};
