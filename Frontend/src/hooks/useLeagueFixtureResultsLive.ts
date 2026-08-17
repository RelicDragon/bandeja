import { useEffect, useMemo } from 'react';
import type { Game } from '@/types';
import type { Round } from '@/types/gameResults';
import { retainGameRoom, releaseGameRoom, onGameRoomsReconnected } from '@/services/gameRoomMembership';
import {
  useLeagueFixtureResultsCache,
  type LeagueFixtureResultsEntry,
} from '@/services/leagueFixtureResultsCache';
import { useSocketEventsStore } from '@/store/socketEventsStore';

/**
 * Join socket rooms for visible league fixtures and keep a shared results cache
 * fresh via `game-results-updated` / `game-updated` (table entry, live scoring, watches).
 */
export function useLeagueFixtureResultsLive(
  games: Array<Pick<Game, 'id' | 'resultsStatus'>>,
): Map<string, Round[] | null> {
  const entries = useLeagueFixtureResultsEntries(games);
  return useMemo(() => {
    const map = new Map<string, Round[] | null>();
    for (const [id, entry] of entries) {
      if (!entry) {
        map.set(id, null);
        continue;
      }
      // Keep empty arrays when hydrated so callers can distinguish "loaded empty" vs missing.
      map.set(id, entry.hydrated || entry.rounds.length > 0 ? entry.rounds : null);
    }
    return map;
  }, [entries]);
}

export function useLeagueFixtureResultsEntries(
  games: Array<Pick<Game, 'id' | 'resultsStatus'>>,
): Map<string, LeagueFixtureResultsEntry | undefined> {
  const idsKey = [...new Set(games.map((g) => g.id))].sort().join(',');
  const gameIdsForMap = games.map((g) => g.id);

  const storeEntries = useLeagueFixtureResultsCache((s) => s.entries);
  const fetchGame = useLeagueFixtureResultsCache((s) => s.fetchGame);
  const scheduleFetch = useLeagueFixtureResultsCache((s) => s.scheduleFetch);
  const patchResultsStatus = useLeagueFixtureResultsCache((s) => s.patchResultsStatus);

  const lastResults = useSocketEventsStore((s) => s.lastGameResultsUpdated);
  const lastGameUpdate = useSocketEventsStore((s) => s.lastGameUpdate);

  useEffect(() => {
    let cancelled = false;
    const retained = idsKey ? idsKey.split(',') : [];

    void (async () => {
      for (const id of retained) {
        try {
          await retainGameRoom(id);
        } catch {
          /* offline join failures are non-fatal; retain rolled back */
        }
      }
      if (cancelled) return;
      for (const id of retained) {
        void fetchGame(id);
      }
    })();

    return () => {
      cancelled = true;
      for (const id of retained) {
        releaseGameRoom(id);
      }
    };
  }, [idsKey, fetchGame]);

  useEffect(() => {
    if (!idsKey) return;
    return onGameRoomsReconnected(() => {
      for (const id of idsKey.split(',')) {
        scheduleFetch(id, 0);
      }
    });
  }, [idsKey, scheduleFetch]);

  useEffect(() => {
    const gameId = lastResults?.gameId;
    if (!gameId || !idsKey || !idsKey.split(',').includes(gameId)) return;
    scheduleFetch(gameId);
  }, [lastResults, idsKey, scheduleFetch]);

  useEffect(() => {
    const gameId = lastGameUpdate?.gameId;
    if (!gameId || !idsKey || !idsKey.split(',').includes(gameId)) return;
    const status = lastGameUpdate.game?.resultsStatus as Game['resultsStatus'] | undefined;
    if (status) {
      patchResultsStatus(gameId, status);
      if (status !== 'NONE') {
        scheduleFetch(gameId, 0);
      }
    }
  }, [lastGameUpdate, idsKey, scheduleFetch, patchResultsStatus]);

  const mapKey = gameIdsForMap.join(',');
  return useMemo(() => {
    const map = new Map<string, LeagueFixtureResultsEntry | undefined>();
    for (const id of mapKey ? mapKey.split(',') : []) {
      map.set(id, storeEntries[id]);
    }
    return map;
  }, [storeEntries, mapKey]);
}

/** Single-fixture subscription used when parent did not pass liveRounds. */
export function useLeagueFixtureResultsForGame(
  game: Pick<Game, 'id' | 'resultsStatus'>,
): Round[] | null {
  const map = useLeagueFixtureResultsLive([game]);
  return map.get(game.id) ?? null;
}

export function useLeagueFixtureResultsEntryForGame(
  game: Pick<Game, 'id' | 'resultsStatus'>,
  enabled: boolean,
): LeagueFixtureResultsEntry | undefined {
  const map = useLeagueFixtureResultsEntries(enabled ? [game] : []);
  return enabled ? map.get(game.id) : undefined;
}
