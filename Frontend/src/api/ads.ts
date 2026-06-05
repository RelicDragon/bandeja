import api from './axios';
import type { ApiResponse } from '@/types';
import type { Sport } from '@/types';
import type { AdPlacementKey } from '@/shared/adPlacements';

export type AdClickAction = 'OPEN_URL' | 'IN_APP_ROUTE' | 'CLUB_PAGE' | 'MARKET_ITEM';
export type AdEventType = 'IMPRESSION' | 'CLICK' | 'DISMISS';

export type AdPlacementPayload = {
  campaignId: string;
  creativeId: string;
  placement: AdPlacementKey;
  imageUrl: string;
  imageUrlDark?: string | null;
  title?: string | null;
  subtitle?: string | null;
  ctaLabel?: string | null;
  clickUrl: string;
  clickAction: AdClickAction;
  metadata?: Record<string, unknown> | null;
  dismissible: boolean;
  dismissSnoozeDays?: number | null;
  clickUrlTrusted: boolean;
  disclosureLabel?: string | null;
  hideDisclosure: boolean;
};

export type AdPlacementsResponse = {
  placements: Partial<Record<AdPlacementKey, AdPlacementPayload | null>>;
};

export type AdSportsByPlacement = Partial<Record<AdPlacementKey, Sport>>;

export type AdPlacementsRequestContext = {
  cityId?: string;
  sportsByPlacement?: AdSportsByPlacement;
};

export type AdEventInput = {
  eventId: string;
  type: AdEventType;
  campaignId: string;
  creativeId: string;
  placement: AdPlacementKey;
  cityId?: string;
  sport?: Sport;
  locale?: string;
  platform?: string;
};

export type AdEventsRequest = {
  adSessionId: string;
  events: AdEventInput[];
};

function createEventId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `ad-event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export { createEventId };

export const adsApi = {
  getPlacements: async (
    keys: AdPlacementKey[],
    adSessionId: string,
    context?: AdPlacementsRequestContext,
  ): Promise<AdPlacementsResponse> => {
    const response = await api.get<ApiResponse<AdPlacementsResponse>>('/ads/placements', {
      params: {
        keys: keys.join(','),
        adSessionId,
        ...(context?.cityId ? { cityId: context.cityId } : {}),
        ...(context?.sportsByPlacement
          ? { context: JSON.stringify({ sportsByPlacement: context.sportsByPlacement }) }
          : {}),
      },
    });
    return response.data.data;
  },

  postEvents: async (payload: AdEventsRequest): Promise<void> => {
    if (payload.events.length === 0) return;
    await api.post('/ads/events', payload);
  },
};
