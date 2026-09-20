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

/** Find shows up to 10 cards, Home up to 3 (PRD 349). */
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
  /** Socket is down: freeze the scores and show the "Reconnecting" caption. */
  isReconnecting: boolean;
  refetch: () => void;
}

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

  // Retain exactly the visible rooms; release every one of them on unmount.
  useEffect(() => {
    if (!enabled || !visibleIdsKey) return;
    const ids = visibleIdsKey.split(',');
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
        } catch {
          /* offline join failures are non-fatal; the retain rolled itself back */
        }
      }
    })();

    return () => {
      released = true;
      for (const id of retained.splice(0)) releaseGameRoom(id);
    };
  }, [visibleIdsKey, enabled]);

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

  return {
    games,
    isLoading: query.isLoading,
    // Only a card that is actually showing a score can "freeze"; an empty rail
    // has nothing to caption.
    isReconnecting: enabled && games.length > 0 && connectionState !== 'connected',
    refetch,
  };
}
