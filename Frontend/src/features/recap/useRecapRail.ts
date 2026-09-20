import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MonthlyRecapCard } from '@/api/recap';
import { useAuthStore } from '@/store/authStore';
import { useRecapListQuery } from '@/queries/recap/useRecapQueries';

/**
 * PRD 353 — the Home recap entry.
 *
 * Owns three things at once, because they are the same state: the bubble at the
 * front of the story rail, the viewer it opens, and the `?recap=YYYY-MM` deep
 * link the "your recap is ready" push lands on.
 *
 * The bubble shows the newest recap the user has not opened. Opening it marks
 * it viewed, which is what removes it from Home — it stays on the profile
 * forever (well, twelve months).
 */

export const RECAP_DEEP_LINK_PARAM = 'recap';

export type RecapRailState = {
  /** The unopened recap, or `null` when there is nothing to show on Home. */
  bubble: MonthlyRecapCard | null;
  viewerOpen: boolean;
  viewerMonthKey: string | null;
  openViewer: (monthKey: string) => void;
  closeViewer: () => void;
};

export function useRecapRail(): RecapRailState {
  const userId = useAuthStore((s) => s.user?.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const { data } = useRecapListQuery(Boolean(userId));
  const [viewerMonthKey, setViewerMonthKey] = useState<string | null>(null);

  const deepLinkMonthKey = searchParams.get(RECAP_DEEP_LINK_PARAM);

  const openViewer = useCallback((monthKey: string) => {
    setViewerMonthKey(monthKey);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerMonthKey(null);
  }, []);

  // A push tap lands on `/?recap=2026-09`. Consume it once, then clean the URL
  // so a back navigation or a refresh does not reopen the reel.
  useEffect(() => {
    if (!deepLinkMonthKey || !userId) return;
    setViewerMonthKey(deepLinkMonthKey);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(RECAP_DEEP_LINK_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [deepLinkMonthKey, userId, setSearchParams]);

  const bubble = useMemo(() => data?.unviewed ?? null, [data?.unviewed]);

  return {
    bubble,
    viewerOpen: viewerMonthKey != null,
    viewerMonthKey,
    openViewer,
    closeViewer,
  };
}
