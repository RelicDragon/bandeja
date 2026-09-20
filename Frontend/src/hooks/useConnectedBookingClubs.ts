import { subscribeBooktimeAllUpcomingCacheInvalidation } from '@/integrations/booktime/booktimeAllUpcomingCacheInvalidation';
import { weltnerApi } from '@/api/weltner';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { booktimeApi } from '@/api/booktime';
import { padelooApi } from '@/api/padeloo';
import { klikterenApi } from '@/api/klikteren';
import { useAuthStore } from '@/store/authStore';
import { useMyGamesQuery } from '@/queries/games/useMyGamesQuery';
import {
  applyBookingAuthNeedsReauth,
  mergeConnectedBookingClubs,
  type ConnectedBookingClubsPayload,
} from '@/hooks/connectedBookingClubs';
import { onBookingAuthInvalidated } from '@/integrations/booking/bookingAuthInvalidation';
import {
  getBookingAuthReauthSnapshot,
  markBookingAuthNeedsReauth,
  subscribeBookingAuthReauth,
} from '@/integrations/booking/bookingAuthReauthRegistry';

type UseConnectedBookingClubsOptions = {
  autoLoad?: boolean;
};

export function useConnectedBookingClubs(enabled = true, options?: UseConnectedBookingClubsOptions) {
  const autoLoad = options?.autoLoad ?? true;
  const userId = useAuthStore((s) => s.user?.id);
  const { data: myTabData, isPending: myTabPending } = useMyGamesQuery(userId, {
    enabled: enabled && !!userId,
  });
  const [data, setData] = useState<ConnectedBookingClubsPayload | null>(null);
  const [dataUserId, setDataUserId] = useState<string | undefined>(undefined);
  const generation = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const reauthVersion = useSyncExternalStore(
    subscribeBookingAuthReauth,
    () => [...getBookingAuthReauthSnapshot().keys()].sort().join('|'),
    () => '',
  );

  const reload = useCallback(async () => {
    const current = ++generation.current;
    if (!enabled || !userId) {
      setData(null);
      return null;
    }
    setLoading(true);
    setError(false);
    try {
      const [booktimeRes, padelooRes, klikterenRes, weltnerRes] = await Promise.all([
        booktimeApi.getMyClubs().catch(() => null),
        padelooApi.getMyClubs().catch(() => null),
        klikterenApi.getMyClubs().catch(() => null),
        weltnerApi.getMyClubs().catch(() => null),
      ]);

      if (generation.current !== current) return null;
      const booktimeClubs = booktimeRes?.data?.clubs ?? [];
      const padelooClubs = padelooRes?.data?.clubs ?? [];
      const klikterenClubs = klikterenRes?.data?.clubs ?? [];
      const merged = mergeConnectedBookingClubs(booktimeClubs, padelooClubs, klikterenClubs, weltnerRes?.data?.clubs ?? []);
      const reauthMap = getBookingAuthReauthSnapshot();
      for (const club of merged) {
        if (reauthMap.has(club.clubId)) {
          markBookingAuthNeedsReauth(
            club.clubId,
            club.integrationType === 'PADELOO'
              ? 'PADELOO'
              : club.integrationType === 'KLIKTEREN'
                ? 'KLIKTEREN'
                : 'BOOKTIME',
            club.clubName,
          );
        }
      }
      const reauthIds = [...getBookingAuthReauthSnapshot().keys()];
      const clubs = applyBookingAuthNeedsReauth(merged, reauthIds);
      const activeConnected = clubs.filter((c) => c.connected && !c.needsReauth).length;

      const payload: ConnectedBookingClubsPayload = {
        cityClubCount:
          (booktimeRes?.data?.cityBooktimeClubCount ?? 0) +
          (padelooRes?.data?.cityPadelooClubCount ?? 0) +
          (klikterenRes?.data?.cityKlikterenClubCount ?? 0) + (weltnerRes?.data?.cityWeltnerClubCount ?? 0),
        connectedCount: activeConnected,
        clubs,
      };
      setDataUserId(userId);
      setData(payload);
      return payload;
    } catch {
      if (generation.current === current) { setError(true); setData(null); }
      return null;
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeBooktimeAllUpcomingCacheInvalidation(() => { void reload(); });
  }, [enabled, reload]);

  const displayData = useMemo(() => {
    if (!data || dataUserId !== userId) return null;
    const reauthIds = reauthVersion ? reauthVersion.split('|') : [];
    const clubs = applyBookingAuthNeedsReauth(data.clubs, reauthIds).slice().sort((a, b) => {
      if (a.needsReauth !== b.needsReauth) return a.needsReauth ? -1 : 1;
      return a.clubName.localeCompare(b.clubName, undefined, { sensitivity: 'base' });
    });
    return {
      ...data,
      clubs,
      connectedCount: clubs.filter((c) => c.connected && !c.needsReauth).length,
    };
  }, [data, dataUserId, userId, reauthVersion]);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    if (!autoLoad) return;
    if (myTabPending) return;
    void reload();
  }, [enabled, autoLoad, myTabPending, myTabData?.booktimeConnected, reload]);

  useEffect(() => {
    if (!enabled) return;
    return onBookingAuthInvalidated(() => {
      void reload();
    });
  }, [enabled, reload]);

  return { data: displayData, loading, error, reload };
}

export type { ConnectedBookingClubRow, ConnectedBookingClubsPayload } from '@/hooks/connectedBookingClubs';
