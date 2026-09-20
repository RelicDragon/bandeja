import { useAuthStore } from '@/store/authStore';
import { subscribeBooktimeAllUpcomingCacheInvalidation } from '@/integrations/booktime/booktimeAllUpcomingCacheInvalidation';
import type { ClubIntegrationType } from '@shared/clubIntegration';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchUserClubBookingIds,
  type UserBooktimeBookingIdsResult,
} from '@/integrations/booktime/userBookingsCheck';

export function useBooktimeUserBookingIds(
  clubId: string | null | undefined,
  companyId: string | null | undefined,
  enabled: boolean,
  integrationType?: ClubIntegrationType,
) {
  const userId = useAuthStore((state) => state.user?.id);
  const [state, setState] = useState<UserBooktimeBookingIdsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const requestKey = `${userId}:${clubId}:${companyId}:${integrationType}:${enabled}`;
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<UserBooktimeBookingIdsResult | null> => {
    const epoch = ++generation.current;
    if (!userId || !enabled || !clubId || (!companyId && integrationType !== 'WELTNER')) {
      setState(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const result = await fetchUserClubBookingIds(clubId, companyId, integrationType);
      if (epoch !== generation.current) return null;
      setState(result);
      setResolvedKey(requestKey);
      return result;
    } catch {
      if (epoch === generation.current) {
        setState({ authenticated: false, ids: new Set() });
        setResolvedKey(requestKey);
      }
      return null;
    } finally {
      if (epoch === generation.current) setLoading(false);
    }
  }, [userId, enabled, clubId, companyId, integrationType, requestKey]);

  useEffect(() => {
    const guard = generation;
    void reload();
    return () => { guard.current++; };
  }, [reload]);

  useEffect(() => {
    if (!enabled || !userId || integrationType !== 'WELTNER') return;
    return subscribeBooktimeAllUpcomingCacheInvalidation(() => { void reload(); });
  }, [enabled, userId, integrationType, reload]);

  const isOwner = useCallback(
    (externalBookingId: string) =>
      Boolean(userId) && enabled && resolvedKey === requestKey && state?.authenticated === true && state.ids.has(externalBookingId),
    [userId, enabled, resolvedKey, requestKey, state],
  );

  return {
    loading,
    isBooktimeConnected: Boolean(userId) && enabled && resolvedKey === requestKey && (state?.authenticated ?? false),
    isOwner,
    reload,
  };
}
