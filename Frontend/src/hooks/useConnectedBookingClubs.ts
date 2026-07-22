import { useCallback, useEffect, useState } from 'react';
import { booktimeApi } from '@/api/booktime';
import { padelooApi } from '@/api/padeloo';
import { klikterenApi } from '@/api/klikteren';
import { useAuthStore } from '@/store/authStore';
import { useMyGamesQuery } from '@/queries/games/useMyGamesQuery';
import {
  mergeConnectedBookingClubs,
  type ConnectedBookingClubsPayload,
} from '@/hooks/connectedBookingClubs';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) {
      setData(null);
      return null;
    }
    setLoading(true);
    setError(false);
    try {
      const [booktimeRes, padelooRes, klikterenRes] = await Promise.all([
        booktimeApi.getMyClubs().catch(() => null),
        padelooApi.getMyClubs().catch(() => null),
        klikterenApi.getMyClubs().catch(() => null),
      ]);

      const booktimeClubs = booktimeRes?.data?.clubs ?? [];
      const padelooClubs = padelooRes?.data?.clubs ?? [];
      const klikterenClubs = klikterenRes?.data?.clubs ?? [];
      const merged = mergeConnectedBookingClubs(booktimeClubs, padelooClubs, klikterenClubs);

      const payload: ConnectedBookingClubsPayload = {
        cityClubCount:
          (booktimeRes?.data?.cityBooktimeClubCount ?? 0) +
          (padelooRes?.data?.cityPadelooClubCount ?? 0) +
          (klikterenRes?.data?.cityKlikterenClubCount ?? 0),
        connectedCount:
          (booktimeRes?.data?.connectedCount ?? 0) +
          (padelooRes?.data?.connectedCount ?? 0) +
          (klikterenRes?.data?.connectedCount ?? 0),
        clubs: merged,
      };
      setData(payload);
      return payload;
    } catch {
      setError(true);
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    if (!autoLoad) return;
    if (myTabPending) return;

    const booktimeConnected = myTabData?.booktimeConnected;
    if (booktimeConnected === false) {
      void reload();
      return;
    }

    void reload();
  }, [enabled, autoLoad, myTabPending, myTabData?.booktimeConnected, reload]);

  return { data, loading, error, reload };
}

export type { ConnectedBookingClubRow, ConnectedBookingClubsPayload } from '@/hooks/connectedBookingClubs';
