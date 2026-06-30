import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import {
  adsApi,
  createEventId,
  type AdEventInput,
  type AdPlacementPayload,
  type AdSportsByPlacement,
} from '@/api/sponsorPlacements';
import { AD_PLACEMENT_KEYS, type AdPlacementKey } from '@/shared/adPlacements';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/utils/networkStatus';
import type { Sport } from '@/types';

function createAdSessionId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `ad-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const adSessionId = createAdSessionId();

type AdPlacementsState = {
  placements: Partial<Record<AdPlacementKey, AdPlacementPayload | null>>;
  sportsByPlacement: AdSportsByPlacement;
  isLoading: boolean;
  cityId: string | undefined;
  setSportForPlacement: (placement: AdPlacementKey, sport: Sport | undefined) => void;
  setCityId: (cityId: string | undefined) => void;
  setPlacements: (placements: Partial<Record<AdPlacementKey, AdPlacementPayload | null>>) => void;
  removePlacement: (placement: AdPlacementKey) => void;
  setLoading: (loading: boolean) => void;
};

const useAdPlacementsStore = create<AdPlacementsState>((set, get) => ({
  placements: {},
  sportsByPlacement: {},
  isLoading: false,
  cityId: undefined,
  setSportForPlacement: (placement, sport) => {
    const prev = get().sportsByPlacement[placement];
    if (prev === sport) return;
    set({
      sportsByPlacement: {
        ...get().sportsByPlacement,
        [placement]: sport,
      },
    });
  },
  setCityId: (cityId) => {
    if (get().cityId === cityId) return;
    set({ cityId });
  },
  setPlacements: (placements) => set({ placements }),
  removePlacement: (placement) => {
    const next = { ...get().placements };
    delete next[placement];
    set({ placements: next });
  },
  setLoading: (isLoading) => set({ isLoading }),
}));

const eventQueue: AdEventInput[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;

async function flushAdEvents() {
  if (flushInFlight || eventQueue.length === 0) return;
  flushInFlight = true;
  const batch = eventQueue.splice(0, 20);
  try {
    await adsApi.postEvents({ adSessionId, events: batch });
  } catch {
    eventQueue.unshift(...batch);
  } finally {
    flushInFlight = false;
    if (eventQueue.length > 0) {
      scheduleAdEventFlush();
    }
  }
}

function scheduleAdEventFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAdEvents();
  }, 500);
}

export function enqueueAdEvent(event: Omit<AdEventInput, 'eventId'> & { eventId?: string }) {
  eventQueue.push({ ...event, eventId: event.eventId ?? createEventId() });
  if (eventQueue.length >= 20) {
    void flushAdEvents();
  } else {
    scheduleAdEventFlush();
  }
}

function sportsContextKey(sports: AdSportsByPlacement, cityId: string | undefined): string {
  return JSON.stringify({ cityId: cityId ?? null, sports });
}

let lastFetchKey: string | null = null;

/** Fetches placements once auth/city/sport context is ready — mount at app shell, not only inside AdSlot. */
export function useAdPlacementsFetcher() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const sportsByPlacement = useAdPlacementsStore((s) => s.sportsByPlacement);
  const setCityId = useAdPlacementsStore((s) => s.setCityId);
  const setPlacements = useAdPlacementsStore((s) => s.setPlacements);
  const setLoading = useAdPlacementsStore((s) => s.setLoading);

  const userCityId = user?.currentCity?.id ?? user?.currentCityId;

  useEffect(() => {
    setCityId(userCityId);
  }, [setCityId, userCityId]);

  useEffect(() => {
    if (isInitializing) return;
    if (!isAuthenticated || !user?.id || !isOnline) {
      setPlacements({});
      lastFetchKey = null;
      return;
    }

    const fetchKey = sportsContextKey(sportsByPlacement, userCityId);
    if (lastFetchKey === fetchKey) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const response = await adsApi.getPlacements(AD_PLACEMENT_KEYS, adSessionId, {
          cityId: userCityId,
          sportsByPlacement,
        });
        if (cancelled) return;
        setPlacements(response.placements ?? {});
        lastFetchKey = fetchKey;
      } catch {
        if (!cancelled) {
          setPlacements({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isInitializing, isAuthenticated, user?.id, isOnline, sportsByPlacement, userCityId, setLoading, setPlacements]);
}

export function useRegisterAdSportContext(placement: AdPlacementKey, sport: Sport | undefined) {
  const setSportForPlacement = useAdPlacementsStore((s) => s.setSportForPlacement);
  useEffect(() => {
    setSportForPlacement(placement, sport);
  }, [placement, sport, setSportForPlacement]);
}

export function useAdPlacementEventMeta(placement: AdPlacementKey) {
  const { i18n } = useTranslation();
  const cityId = useAdPlacementsStore((s) => s.cityId);
  const sport = useAdPlacementsStore((s) => s.sportsByPlacement[placement]);

  return useMemo(
    () => ({
      cityId,
      sport,
      locale: i18n.language.split('-')[0],
    }),
    [cityId, i18n.language, sport],
  );
}

export function useAdPlacements() {
  const user = useAuthStore((s) => s.user);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const placements = useAdPlacementsStore((s) => s.placements);
  const isLoading = useAdPlacementsStore((s) => s.isLoading);
  const removePlacement = useAdPlacementsStore((s) => s.removePlacement);

  const dismissPlacement = useCallback(
    (
      placement: AdPlacementKey,
      payload: AdPlacementPayload,
      meta?: Pick<AdEventInput, 'cityId' | 'sport' | 'locale'>,
    ) => {
      removePlacement(placement);
      enqueueAdEvent({
        type: 'DISMISS',
        campaignId: payload.campaignId,
        creativeId: payload.creativeId,
        placement,
        ...meta,
      });
    },
    [removePlacement],
  );

  const getPlacement = useCallback(
    (placement: AdPlacementKey): AdPlacementPayload | null | undefined => {
      if (!isOnline || !user?.id) return null;
      return placements[placement] ?? null;
    },
    [isOnline, placements, user?.id],
  );

  return useMemo(
    () => ({
      adSessionId,
      placements: isOnline ? placements : {},
      isLoading,
      isOnline,
      getPlacement,
      dismissPlacement,
      enqueueAdEvent,
    }),
    [dismissPlacement, getPlacement, isLoading, isOnline, placements],
  );
}
