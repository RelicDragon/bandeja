/**
 * Local cache of reservation-change runs, one per game (`localStorage`).
 *
 * The server journal (`/games/:id/reservation-changes`) is the cross-device
 * record; this copy is what lets a killed app resume offline and is written
 * synchronously before every call. Unreadable or foreign-version entries are
 * dropped rather than thrown on.
 */
import type { RunJournal, RunJournalStore } from './reservationRunner';

const PREFIX = 'courtReservations:run:';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function runJournalKey(gameId: string): string {
  return `${PREFIX}${gameId}`;
}

function isJournal(value: unknown): value is RunJournal {
  const j = value as Partial<RunJournal> | null;
  return Boolean(j && j.version === 2 && typeof j.gameId === 'string' && Array.isArray(j.steps));
}

export function createRunJournalStore(storage: StorageLike | null = defaultStorage()): RunJournalStore {
  return {
    load(gameId) {
      if (!storage) return null;
      try {
        const raw = storage.getItem(runJournalKey(gameId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!isJournal(parsed) || parsed.gameId !== gameId) {
          storage.removeItem(runJournalKey(gameId));
          return null;
        }
        return { ...parsed, mirrorQueue: parsed.mirrorQueue ?? [] };
      } catch {
        return null;
      }
    },
    save(journal) {
      if (!storage) return;
      try {
        storage.setItem(runJournalKey(journal.gameId), JSON.stringify(journal));
      } catch {
        // Quota / private mode: the server mirror still records the run.
      }
    },
    clear(gameId) {
      try {
        storage?.removeItem(runJournalKey(gameId));
      } catch {
        // ignore
      }
    },
  };
}

/** In-memory store for tests and the preview. */
export function createMemoryRunJournalStore(): RunJournalStore & { snapshot(gameId: string): RunJournal | null } {
  const map = new Map<string, string>();
  return {
    load: (gameId) => {
      const raw = map.get(gameId);
      return raw ? (JSON.parse(raw) as RunJournal) : null;
    },
    save: (journal) => {
      map.set(journal.gameId, JSON.stringify(journal));
    },
    clear: (gameId) => {
      map.delete(gameId);
    },
    snapshot: (gameId) => {
      const raw = map.get(gameId);
      return raw ? (JSON.parse(raw) as RunJournal) : null;
    },
  };
}
