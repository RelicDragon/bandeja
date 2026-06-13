import { useEffect, useState } from 'react';
import type { Game } from '@/types';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';

export type BooktimeOrphanLinkState = {
  orphan: boolean | null;
  missingCount: number;
};

export function useBooktimeOrphanLink(
  game: Game,
  isOwner: boolean,
  enabled: boolean,
): BooktimeOrphanLinkState {
  const [state, setState] = useState<BooktimeOrphanLinkState>({ orphan: null, missingCount: 0 });
  const linkedIdsKey = (game.linkedBookings ?? []).map((b) => b.externalBookingId).filter(Boolean).join(',');

  useEffect(() => {
    const linkedIds = linkedIdsKey ? linkedIdsKey.split(',') : [];
    if (!enabled || !isOwner || linkedIds.length === 0) {
      setState({ orphan: null, missingCount: 0 });
      return;
    }
    if (game.status !== 'ANNOUNCED' && game.status !== 'STARTED') {
      setState({ orphan: null, missingCount: 0 });
      return;
    }
    const clubId = game.clubId ?? game.court?.clubId ?? game.court?.club?.id;
    const companyId =
      game.club?.integrationConfig?.companyId ??
      game.court?.club?.integrationConfig?.companyId;
    if (!clubId || !companyId) {
      setState({ orphan: null, missingCount: 0 });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await hydrateBooktimeSession(clubId, companyId);
        const client = getBooktimeClient(clubId, companyId);
        if (!client.isAuthenticated) {
          if (!cancelled) setState({ orphan: null, missingCount: 0 });
          return;
        }
        const [upcoming, previous] = await Promise.all([
          client.getUpcomingBookings(0, 50),
          client.getPreviousBookings(0, 50),
        ]);
        const ids = new Set(
          [...(upcoming.bookings ?? []), ...(previous.bookings ?? [])].map((b) => b.uuid),
        );
        if (!cancelled) {
          const missing = linkedIds.filter((id) => !ids.has(id));
          setState({ orphan: missing.length > 0, missingCount: missing.length });
        }
      } catch {
        if (!cancelled) setState({ orphan: null, missingCount: 0 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    isOwner,
    linkedIdsKey,
    game.status,
    game.clubId,
    game.club?.integrationConfig?.companyId,
    game.court?.clubId,
    game.court?.club?.id,
    game.court?.club?.integrationConfig?.companyId,
  ]);

  return state;
}
