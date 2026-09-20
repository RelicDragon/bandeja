import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import type { Game } from '@/types';
import { markSeatedFromQueuePending } from './seatedFromQueueMarker';

export interface UseSpotOpenedRealtimeOptions {
  gameId: string | undefined;
  viewerUserId: string | undefined;
  isOrganizer: boolean;
  /** Pull a fresh game so the roster, queue and positions all agree. */
  onRefresh: () => void;
  /** Resolves a seated player's display name for the organizer toast. */
  game: Game | null | undefined;
}

export interface UseSpotOpenedRealtimeResult {
  /** The viewer was the one auto-fill seated, seen live on this page. */
  seatedLive: boolean;
}

/**
 * The seated player may still be listed in `joinQueues` when the event lands,
 * because the refetch has not returned yet — check both sides.
 */
function displayName(game: Game | null | undefined, userId: string): string | null {
  const fromRoster = game?.participants?.find((p) => p.userId === userId)?.user;
  const fromQueue = game?.joinQueues?.find((q) => q.userId === userId)?.user;
  const user = fromRoster ?? fromQueue;
  if (!user) return null;
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name || null;
}

/**
 * PRD 347 — keeps game details in step with `game-seat-opened` /
 * `game-seat-filled`.
 *
 * The details shell already holds the `game-${id}` room (ref-counted through
 * `gameRoomMembership`), so this only reads the last-event slots. The organizer
 * gets the "Ana joined from the queue" toast; the seated player gets the
 * one-time green header.
 */
export function useSpotOpenedRealtime({
  gameId,
  viewerUserId,
  isOrganizer,
  onRefresh,
  game,
}: UseSpotOpenedRealtimeOptions): UseSpotOpenedRealtimeResult {
  const { t } = useTranslation();
  const seatOpened = useSocketEventsStore((s) => s.lastGameSeatOpened);
  const seatFilled = useSocketEventsStore((s) => s.lastGameSeatFilled);
  const [seatedLive, setSeatedLive] = useState(false);

  const lastOpenedRef = useRef<string | null>(null);
  const lastFilledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gameId || !seatOpened || seatOpened.gameId !== gameId) return;
    const key = `${seatOpened.gameId}:${seatOpened.lastSeatOpenedAt}`;
    if (lastOpenedRef.current === key) return;
    lastOpenedRef.current = key;
    onRefresh();
  }, [gameId, onRefresh, seatOpened]);

  useEffect(() => {
    if (!gameId || !seatFilled || seatFilled.gameId !== gameId) return;
    const key = `${seatFilled.gameId}:${seatFilled.userId}`;
    if (lastFilledRef.current === key) return;
    lastFilledRef.current = key;

    if (seatFilled.userId === viewerUserId) {
      markSeatedFromQueuePending(gameId);
      setSeatedLive(true);
    } else if (isOrganizer) {
      const name = displayName(game, seatFilled.userId);
      if (name) toast.success(t('spots.toast.joinedFromQueue', { name }));
    }
    onRefresh();
  }, [game, gameId, isOrganizer, onRefresh, seatFilled, t, viewerUserId]);

  return { seatedLive };
}
