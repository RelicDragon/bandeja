import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { liveApi, type LiveRailGame } from '@/api/live';
import { queryKeys } from '@/queries/queryKeys';
import {
  onGameRoomsReconnected,
  releaseGameRoom,
  retainGameRoom,
} from '@/services/gameRoomMembership';
import { socketService, type SocketConnectionState } from '@/services/socketService';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import type { LiveGameSummary } from '@/types';
import { applyLiveScoringFrame } from './liveSummaryUpdate';

/** Find shows up to 10 cards, Home up to 3 (PRD 349) — live, in progress, then today's finals. */
export const LIVE_RAIL_FIND_LIMIT = 10;
export const LIVE_RAIL_HOME_LIMIT = 3;

/** The rail is cheap but chatty — the socket keeps it fresh between refetches. */
const LIVE_RAIL_STALE_MS = 30_000;
const LIVE_RAIL_REFETCH_MS = 60_000;

export interface UseLiveGamesOptions {
  /** Defaults to the viewer's current city, resolved server-side. */
  cityId?: string;
  limit?: number;
  /** Skip the request entirely (feature off, viewer signed out, …). */
  enabled?: boolean;
}

export interface UseLiveGamesResult {
  games: LiveRailGame[];
  isLoading: boolean;
  /** Socket is down: freeze every score and show the "Reconnecting" caption. */
  isReconnecting: boolean;
  /**
   * Cards whose own score is stale — the union of "socket is down" (all of them)
   * and "this one room failed to join" (just that card). A card outside this set
   * is genuinely live.
   */
  reconnectingGameIds: ReadonlySet<string>;
  refetch: () => void;
}

const EMPTY_ID_SET: ReadonlySet<string> = new Set<string>();

/**
 * PRD 349 — live rail data plus its socket lifecycle.
 *
 * Subscription rules, all deliberate:
 *  • only the **visible** cards are retained (`retainGameRoom`), and every room
 *    is released on unmount — the rail must not keep a city's worth of rooms
 *    open behind the user's back;
 *  • score frames are merged locally through `applyLiveScoringFrame`, which
 *    drops any frame that is not newer than what is on screen;
 *  • on reconnect the list is refetched, because frames missed while the socket
 *    was down cannot be replayed.
 */
export function useLiveGames(options: UseLiveGamesOptions = {}): UseLiveGamesResult {
  const { cityId, limit = LIVE_RAIL_FIND_LIMIT, enabled = true } = options;

  const query = useQuery({
    queryKey: queryKeys.live.games(cityId, limit),
    queryFn: async () => {
      const response = await liveApi.list({ cityId, limit });
      return response.data.data.games;
    },
    enabled,
    staleTime: LIVE_RAIL_STALE_MS,
    refetchInterval: enabled ? LIVE_RAIL_REFETCH_MS : false,
  });

  const fetched = useMemo(() => query.data ?? [], [query.data]);

  /**
   * Socket-applied summaries, keyed by game id. Kept beside the query cache
   * rather than written into it so a background refetch cannot clobber a newer
   * socket frame — the merge below always keeps the higher revision.
   */
  const [liveOverlay, setLiveOverlay] = useState<Record<string, LiveGameSummary>>({});
  /** Cards whose room join failed while the socket itself was up (PRD 349). */
  const [unjoinedIds, setUnjoinedIds] = useState<ReadonlySet<string>>(EMPTY_ID_SET);

  const games = useMemo(
    () =>
      fetched.map((game) => {
        const patched = liveOverlay[game.id];
        if (!patched) return game;
        const fetchedRevision = game.liveSummary.revision ?? -1;
        const patchedRevision = patched.revision ?? -1;
        if (patchedRevision <= fetchedRevision) return game;
        return { ...game, liveSummary: patched };
      }),
    [fetched, liveOverlay],
  );

  const visibleIdsKey = useMemo(() => fetched.map((g) => g.id).join(','), [fetched]);
  /** Only live cards take score frames; finished and in-progress cards have no board. */
  const liveIdsKey = useMemo(
    () =>
      fetched
        .filter((g) => g.phase === 'live')
        .map((g) => g.id)
        .join(','),
    [fetched],
  );

  // Retain exactly the visible live rooms; release every one of them on unmount.
  useEffect(() => {
    if (!enabled || !liveIdsKey) return;
    const ids = liveIdsKey.split(',');
    /**
     * Only the rooms this effect actually took, so cleanup stays balanced. The
     * retain loop is asynchronous and can be interrupted mid-list by a refetch;
     * releasing an id we never retained would drive a *different* subscriber's
     * ref count to zero and silently leave them the room.
     */
    const retained: string[] = [];
    let released = false;

    void (async () => {
      for (const id of ids) {
        if (released) return;
        try {
          await retainGameRoom(id);
          // The cleanup may have run while that join was in flight.
          if (released) {
            releaseGameRoom(id);
            return;
          }
          retained.push(id);
          // Joined: this card's frames are live again.
          setUnjoinedIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } catch {
          /*
           * The retain rolled itself back, so this one card is not in its room
           * while the socket is otherwise up. Without this the card would show
           * a frozen score that looks live — the whole reason the caption
           * exists. Tracked per id rather than globally.
           */
          setUnjoinedIds((prev) => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }
      }
    })();

    return () => {
      released = true;
      for (const id of retained.splice(0)) releaseGameRoom(id);
    };
  }, [liveIdsKey, enabled]);

  // Drop overlay entries for cards that are no longer on the rail.
  useEffect(() => {
    const ids = new Set(visibleIdsKey ? visibleIdsKey.split(',') : []);
    setLiveOverlay((prev) => {
      const next: Record<string, LiveGameSummary> = {};
      let changed = false;
      for (const [id, summary] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = summary;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleIdsKey]);

  const lastFrame = useSocketEventsStore((s) => s.lastMatchLiveScoringUpdated);
  const baseSummaries = useRef<Record<string, LiveGameSummary>>({});
  baseSummaries.current = Object.fromEntries(games.map((g) => [g.id, g.liveSummary]));

  useEffect(() => {
    if (!lastFrame) return;
    const base = baseSummaries.current[lastFrame.gameId];
    if (!base) return;

    const next = applyLiveScoringFrame(base, {
      gameId: lastFrame.gameId,
      matchId: lastFrame.matchId,
      liveScoring: lastFrame.liveScoring,
    });
    if (next === base) return;

    setLiveOverlay((prev) => ({ ...prev, [lastFrame.gameId]: next }));
  }, [lastFrame]);

  /*
   * `query` is a fresh object every render, so the refetch is held in a ref:
   * without it the reconnect subscription below would tear down and re-add a
   * listener on every single render.
   */
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;

  const refetch = useCallback(() => {
    void refetchRef.current();
  }, []);

  // Frames missed while the socket was down cannot be replayed — refetch.
  useEffect(() => {
    if (!enabled) return;
    return onGameRoomsReconnected(() => {
      void refetchRef.current();
    });
  }, [enabled]);

  const [connectionState, setConnectionState] = useState<SocketConnectionState>(() =>
    socketService.getConnectionState(),
  );
  useEffect(() => {
    setConnectionState(socketService.getConnectionState());
    return socketService.onConnectionStateChange(setConnectionState);
  }, []);

  const socketDown = enabled && connectionState !== 'connected';

  /*
   * Per card, because the two ways a score can go stale are different: the
   * socket being down freezes every card, but a single room that failed to join
   * freezes exactly one while the rail around it keeps updating.
   */
  const reconnectingGameIds = useMemo(() => {
    const liveIds = games.filter((game) => game.phase === 'live').map((game) => game.id);
    if (socketDown) return new Set(liveIds);
    if (unjoinedIds.size === 0) return EMPTY_ID_SET;
    return new Set(liveIds.filter((id) => unjoinedIds.has(id)));
  }, [games, socketDown, unjoinedIds]);

  return {
    games,
    isLoading: query.isLoading,
    // Only a card that is actually showing a live score can "freeze"; a rail
    // of results typed in by hand has nothing to caption.
    isReconnecting: socketDown && games.some((game) => game.phase === 'live'),
    reconnectingGameIds,
    refetch,
  };
}
