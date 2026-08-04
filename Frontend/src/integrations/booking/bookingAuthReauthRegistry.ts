import type { BookingAuthProvider } from '@/integrations/booking/bookingAuthInvalidation';

export type BookingAuthReauthEntry = {
  clubId: string;
  provider: BookingAuthProvider;
  clubName?: string | null;
  at: number;
};

const STORAGE_KEY = 'bandeja.bookingAuthNeedsReauth.v1';
const listeners = new Set<() => void>();

let entries = new Map<string, BookingAuthReauthEntry>();
let hydrated = false;

function notify(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

function readStorage(): Map<string, BookingAuthReauthEntry> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as BookingAuthReauthEntry[];
    if (!Array.isArray(parsed)) return new Map();
    const map = new Map<string, BookingAuthReauthEntry>();
    for (const row of parsed) {
      if (!row || typeof row.clubId !== 'string' || !row.clubId) continue;
      if (row.provider !== 'BOOKTIME' && row.provider !== 'PADELOO' && row.provider !== 'KLIKTEREN') {
        continue;
      }
      map.set(row.clubId, {
        clubId: row.clubId,
        provider: row.provider,
        clubName: typeof row.clubName === 'string' ? row.clubName : null,
        at: typeof row.at === 'number' ? row.at : Date.now(),
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

function writeStorage(map: Map<string, BookingAuthReauthEntry>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...map.values()]));
  } catch {
    /* quota / private mode */
  }
}

function ensureHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  entries = readStorage();
}

function setEntries(next: Map<string, BookingAuthReauthEntry>): void {
  entries = next;
  writeStorage(next);
  notify();
}

export function subscribeBookingAuthReauth(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBookingAuthReauthSnapshot(): ReadonlyMap<string, BookingAuthReauthEntry> {
  ensureHydrated();
  return entries;
}

export function bookingAuthNeedsReauth(clubId: string): boolean {
  ensureHydrated();
  return entries.has(clubId);
}

export function getBookingAuthReauthEntry(clubId: string): BookingAuthReauthEntry | null {
  ensureHydrated();
  return entries.get(clubId) ?? null;
}

export function markBookingAuthNeedsReauth(
  clubId: string,
  provider: BookingAuthProvider,
  clubName?: string | null,
): void {
  ensureHydrated();
  const next = new Map(entries);
  const prev = next.get(clubId);
  next.set(clubId, {
    clubId,
    provider,
    clubName: clubName?.trim() || prev?.clubName || null,
    at: Date.now(),
  });
  setEntries(next);
}

export function clearBookingAuthNeedsReauth(clubId: string): void {
  ensureHydrated();
  if (!entries.has(clubId)) return;
  const next = new Map(entries);
  next.delete(clubId);
  setEntries(next);
}

export function clearAllBookingAuthNeedsReauth(): void {
  ensureHydrated();
  if (entries.size === 0) return;
  setEntries(new Map());
}
