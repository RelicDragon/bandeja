import { useCallback, useRef, useState } from 'react';
import { booktimeApi } from '@/api/booktime';
import type { Club } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import {
  formatClubDateKey,
  isSnapshotStale,
  mapGetForDayToSnapshotCourts,
  parseGetForDayResponse,
} from '@/integrations/booktime/slots';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';

export type BooktimeSnapshotBanner = 'updating' | 'noSyncToday' | 'scoutPoolEmpty' | null;

type RefreshOptions = {
  force?: boolean;
};

function booktimeCompanyId(club: Club): string | null {
  const raw = club.integrationConfig;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const companyId = (raw as Record<string, unknown>).companyId;
  return typeof companyId === 'string' && companyId.trim() ? companyId.trim() : null;
}

function requestStatus(err: unknown): number {
  return err && typeof err === 'object' && 'status' in err ? Number((err as { status: number }).status) : 0;
}

async function getForDayWithScoutPool(
  clubId: string,
  companyId: string,
  date: Date
): Promise<{ ok: true; data: unknown } | { ok: false; poolEmpty: true }> {
  const excludedAuthIds: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const scoutRes = await booktimeApi.getScoutToken(clubId, excludedAuthIds);
    if (!scoutRes.success || !scoutRes.data?.available) {
      return { ok: false, poolEmpty: true };
    }
    const scout = scoutRes.data;
    const client = new BooktimeClient({ companyId, accessToken: scout.accessToken });
    try {
      const data = await client.getForDay(date);
      return { ok: true, data };
    } catch (err) {
      if (requestStatus(err) === 401) {
        await booktimeApi.invalidateScoutToken(clubId, scout.authId);
        excludedAuthIds.push(scout.authId);
        continue;
      }
      throw err;
    }
  }
  return { ok: false, poolEmpty: true };
}

export function useBooktimeSnapshotRefresh(
  club: Club | undefined,
  selectedDate: Date,
  enabled: boolean
) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [banner, setBanner] = useState<BooktimeSnapshotBanner>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);

  const refreshSnapshot = useCallback(
    async (options: RefreshOptions = {}): Promise<boolean> => {
      if (!enabled || !club || club.integrationType !== 'BOOKTIME') return false;
      const companyId = booktimeCompanyId(club);
      if (!companyId) return false;

      if (inFlightRef.current) return inFlightRef.current;

      const run = (async () => {
        const dateKey = formatClubDateKey(selectedDate, club);
        setIsRefreshing(true);
        setBanner('updating');

        try {
          const snapshotRes = await booktimeApi.getSnapshot(club.id, dateKey);
          const existingFetchedAt = snapshotRes.data?.fetchedAt ?? null;
          setLastFetchedAt(existingFetchedAt);

          if (!options.force && existingFetchedAt && !isSnapshotStale(existingFetchedAt)) {
            setBanner(null);
            return true;
          }

          const authRes = await booktimeApi.getAuth(club.id);
          const connected = !!authRes.data?.connected;
          let dayData: unknown;

          if (connected) {
            await hydrateBooktimeSession(club.id, companyId);
            const client = getBooktimeClient(club.id, companyId);
            if (client.isAuthenticated) {
              try {
                dayData = await client.getForDay(selectedDate);
              } catch (err) {
                if (requestStatus(err) !== 401) throw err;
              }
            }
          }

          if (dayData == null) {
            const scoutResult = await getForDayWithScoutPool(club.id, companyId, selectedDate);
            if (!scoutResult.ok) {
              setBanner(existingFetchedAt ? 'scoutPoolEmpty' : 'noSyncToday');
              return false;
            }
            dayData = scoutResult.data;
          }

          const courts = mapGetForDayToSnapshotCourts(club, parseGetForDayResponse(dayData));
          const fetchedAt = new Date().toISOString();
          await booktimeApi.putSnapshot(club.id, {
            date: dateKey,
            fetchedAt,
            force: options.force === true,
            courts,
          });

          setLastFetchedAt(fetchedAt);
          setBanner(null);
          return true;
        } catch (err) {
          if (requestStatus(err) === 429) {
            setBanner(null);
            return false;
          }
          console.error('Club booking snapshot refresh failed:', err);
          setBanner(lastFetchedAt ? 'scoutPoolEmpty' : 'noSyncToday');
          return false;
        } finally {
          setIsRefreshing(false);
          inFlightRef.current = null;
        }
      })();

      inFlightRef.current = run;
      return run;
    },
    [club, enabled, lastFetchedAt, selectedDate]
  );

  return {
    refreshSnapshot,
    isRefreshingSnapshot: isRefreshing,
    snapshotBanner: banner,
    lastFetchedAt,
  };
}
