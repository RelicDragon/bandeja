import { useEffect, useState } from 'react';
import type { Game } from '@/types';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';

export function useBooktimeOrphanLink(
  game: Game,
  isOwner: boolean,
  enabled: boolean
): boolean | null {
  const [orphan, setOrphan] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled || !isOwner || !game.externalBookingId || game.externalBookingProvider !== 'BOOKTIME') {
      setOrphan(null);
      return;
    }
    if (game.status !== 'ANNOUNCED' && game.status !== 'STARTED') {
      setOrphan(null);
      return;
    }
    const clubId = game.clubId ?? game.court?.clubId ?? game.court?.club?.id;
    const companyId =
      game.club?.integrationConfig?.companyId ??
      game.court?.club?.integrationConfig?.companyId;
    if (!clubId || !companyId) {
      setOrphan(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await hydrateBooktimeSession(clubId, companyId);
        const client = getBooktimeClient(clubId, companyId);
        if (!client.isAuthenticated) {
          if (!cancelled) setOrphan(null);
          return;
        }
        const [upcoming, previous] = await Promise.all([
          client.getUpcomingBookings(0, 50),
          client.getPreviousBookings(0, 50),
        ]);
        const ids = new Set(
          [...(upcoming.bookings ?? []), ...(previous.bookings ?? [])].map((b) => b.uuid)
        );
        if (!cancelled) {
          setOrphan(!ids.has(game.externalBookingId!));
        }
      } catch {
        if (!cancelled) setOrphan(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    isOwner,
    game.externalBookingId,
    game.externalBookingProvider,
    game.status,
    game.clubId,
    game.club?.integrationConfig?.companyId,
    game.court?.clubId,
    game.court?.club?.id,
    game.court?.club?.integrationConfig?.companyId,
  ]);

  return orphan;
}
