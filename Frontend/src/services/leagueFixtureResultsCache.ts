import { create } from 'zustand';
import { resultsApi } from '@/api/results';
import type { Game } from '@/types';
import type { Round } from '@/types/gameResults';
import { convertServerResultsToRounds } from '@/utils/serverResultsToRounds';

export type LeagueFixtureResultsEntry = {
  rounds: Round[];
  resultsStatus: Game['resultsStatus'] | null;
  version: number;
  loading: boolean;
  /** True once at least one fetch finished (success or fail). */
  hydrated: boolean;
};

type LeagueFixtureResultsCacheState = {
  entries: Record<string, LeagueFixtureResultsEntry>;
  fetchGame: (gameId: string) => Promise<void>;
  /** Debounced refetch for rapid live-scoring patches. */
  scheduleFetch: (gameId: string, debounceMs?: number) => void;
  /** Immediate local write-through after a successful edit (no wait for socket echo). */
  applyLocalRounds: (
    gameId: string,
    rounds: Round[],
    resultsStatus?: Game['resultsStatus'] | null,
  ) => void;
  patchResultsStatus: (gameId: string, resultsStatus: Game['resultsStatus']) => void;
};

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Map<string, Promise<void>>();
const fetchGeneration = new Map<string, number>();

function emptyEntry(partial?: Partial<LeagueFixtureResultsEntry>): LeagueFixtureResultsEntry {
  return {
    rounds: [],
    resultsStatus: null,
    version: 0,
    loading: false,
    hydrated: false,
    ...partial,
  };
}

export const useLeagueFixtureResultsCache = create<LeagueFixtureResultsCacheState>((set, get) => ({
  entries: {},

  async fetchGame(gameId: string) {
    const existing = inFlight.get(gameId);
    if (existing) return existing;

    const generation = (fetchGeneration.get(gameId) ?? 0) + 1;
    fetchGeneration.set(gameId, generation);

    const slot: { promise?: Promise<void> } = {};
    slot.promise = (async () => {
      set((state) => ({
        entries: {
          ...state.entries,
          [gameId]: {
            ...emptyEntry(state.entries[gameId]),
            loading: true,
          },
        },
      }));

      try {
        const response = await resultsApi.getGameResults(gameId);
        if (fetchGeneration.get(gameId) !== generation) return;

        const payload = response.data;
        const rounds = convertServerResultsToRounds(payload);
        set((state) => ({
          entries: {
            ...state.entries,
            [gameId]: {
              rounds,
              resultsStatus:
                (payload?.resultsStatus as Game['resultsStatus'] | undefined) ??
                state.entries[gameId]?.resultsStatus ??
                null,
              version: (state.entries[gameId]?.version ?? 0) + 1,
              loading: false,
              hydrated: true,
            },
          },
        }));
      } catch {
        if (fetchGeneration.get(gameId) !== generation) return;
        set((state) => ({
          entries: {
            ...state.entries,
            [gameId]: {
              ...emptyEntry(state.entries[gameId]),
              loading: false,
              hydrated: true,
            },
          },
        }));
      } finally {
        if (inFlight.get(gameId) === slot.promise) inFlight.delete(gameId);
      }
    })();

    inFlight.set(gameId, slot.promise);
    return slot.promise;
  },

  scheduleFetch(gameId: string, debounceMs = 300) {
    const prev = debounceTimers.get(gameId);
    if (prev) clearTimeout(prev);
    if (debounceMs <= 0) {
      debounceTimers.delete(gameId);
      void get().fetchGame(gameId);
      return;
    }
    debounceTimers.set(
      gameId,
      setTimeout(() => {
        debounceTimers.delete(gameId);
        void get().fetchGame(gameId);
      }, debounceMs),
    );
  },

  applyLocalRounds(gameId, rounds, resultsStatus) {
    set((state) => {
      const prev = state.entries[gameId];
      return {
        entries: {
          ...state.entries,
          [gameId]: {
            rounds,
            resultsStatus: resultsStatus ?? prev?.resultsStatus ?? null,
            version: (prev?.version ?? 0) + 1,
            loading: false,
            hydrated: true,
          },
        },
      };
    });
  },

  patchResultsStatus(gameId, resultsStatus) {
    set((state) => {
      const prev = emptyEntry(state.entries[gameId]);
      return {
        entries: {
          ...state.entries,
          [gameId]: {
            ...prev,
            resultsStatus,
            version: prev.version + 1,
          },
        },
      };
    });
  },
}));

export function __resetLeagueFixtureResultsCacheForTests(): void {
  for (const timer of debounceTimers.values()) clearTimeout(timer);
  debounceTimers.clear();
  inFlight.clear();
  fetchGeneration.clear();
  useLeagueFixtureResultsCache.setState({ entries: {} });
}
