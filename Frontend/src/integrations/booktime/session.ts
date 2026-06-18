import { booktimeApi } from '@/api/booktime';
import { BooktimeClient } from './client';
import { formatBooktimeErrorMessage } from './formatBooktimeErrorMessage';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import {
  booktimeSessionStorageKey,
  BOOKTIME_SESSION_STORAGE_PREFIX,
  type BooktimeStoredSession,
} from './config';
import {
  clearProactiveBooktimeRefresh,
  restoreProactiveBooktimeRefreshForStoredSessions,
  scheduleProactiveBooktimeRefresh,
} from './proactiveRefresh';
import { clearRateLimitState, type BooktimeRateLimitConfig } from './rateLimiter';

type SessionEntry = {
  client: BooktimeClient;
  companyId: string;
  externalUserId: string | null;
};

const memoryClients = new Map<string, SessionEntry>();
const reconnectListeners = new Map<string, Set<() => void>>();
const backendSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();

function listStoredBooktimeClubIds(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(BOOKTIME_SESSION_STORAGE_PREFIX)) {
      ids.push(key.slice(BOOKTIME_SESSION_STORAGE_PREFIX.length));
    }
  }
  return ids;
}

function scheduleBackendTokenSync(clubId: string, session: BooktimeStoredSession): void {
  const existing = backendSyncTimers.get(clubId);
  if (existing) clearTimeout(existing);
  backendSyncTimers.set(
    clubId,
    setTimeout(() => {
      backendSyncTimers.delete(clubId);
      void booktimeApi
        .putAuth(clubId, {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          externalUserId: session.externalUserId,
        })
        .catch(() => {
          /* non-blocking */
        });
    }, 500)
  );
}

function readStoredSession(clubId: string): BooktimeStoredSession | null {
  const raw = sessionStorage.getItem(booktimeSessionStorageKey(clubId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BooktimeStoredSession;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      typeof parsed.externalUserId === 'string' &&
      typeof parsed.companyId === 'string'
    ) {
      return parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

function writeStoredSession(clubId: string, session: BooktimeStoredSession): void {
  sessionStorage.setItem(booktimeSessionStorageKey(clubId), JSON.stringify(session));
}

function clearStoredSession(clubId: string): void {
  sessionStorage.removeItem(booktimeSessionStorageKey(clubId));
}

function notifyReconnect(clubId: string): void {
  reconnectListeners.get(clubId)?.forEach((fn) => fn());
}

export function onBooktimeReconnectRequired(clubId: string, listener: () => void): () => void {
  const set = reconnectListeners.get(clubId) ?? new Set();
  set.add(listener);
  reconnectListeners.set(clubId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) reconnectListeners.delete(clubId);
  };
}

function createClient(
  clubId: string,
  companyId: string,
  stored: BooktimeStoredSession | null,
  clubTimeZone?: string | null,
  rateLimitConfig?: BooktimeRateLimitConfig,
): BooktimeClient {
  const client = new BooktimeClient({
    clubId,
    companyId,
    accessToken: stored?.accessToken ?? null,
    refreshToken: stored?.refreshToken ?? null,
    clubTimeZone,
    rateLimitConfig,
    onTokensUpdated: ({ accessToken, refreshToken }) => {
      const current = readStoredSession(clubId);
      if (!current) return;
      const updated = { ...current, accessToken, refreshToken };
      writeStoredSession(clubId, updated);
      scheduleBackendTokenSync(clubId, updated);
      scheduleProactiveBooktimeRefresh(clubId, accessToken, client);
    },
    onSessionExpired: () => {
      clearProactiveBooktimeRefresh(clubId);
      const syncTimer = backendSyncTimers.get(clubId);
      if (syncTimer) {
        clearTimeout(syncTimer);
        backendSyncTimers.delete(clubId);
      }
      clearStoredSession(clubId);
      memoryClients.delete(clubId);
      notifyReconnect(clubId);
    },
  });
  if (stored?.accessToken && stored.refreshToken) {
    scheduleProactiveBooktimeRefresh(clubId, stored.accessToken, client);
  }
  return client;
}

export function getBooktimeClient(
  clubId: string,
  companyId: string,
  clubTimeZone?: string | null,
  rateLimitConfig?: BooktimeRateLimitConfig,
): BooktimeClient {
  const existing = memoryClients.get(clubId);
  if (existing && existing.companyId === companyId) {
    if (clubTimeZone !== undefined) {
      existing.client.setClubTimeZone(clubTimeZone);
    }
    return existing.client;
  }

  const stored = readStoredSession(clubId);
  const client = createClient(
    clubId,
    companyId,
    stored?.companyId === companyId ? stored : null,
    clubTimeZone,
    rateLimitConfig,
  );
  memoryClients.set(clubId, {
    client,
    companyId,
    externalUserId: stored?.externalUserId ?? null,
  });
  return client;
}

export async function hydrateBooktimeSession(
  clubId: string,
  companyId: string,
  clubTimeZone?: string | null,
  rateLimitConfig?: BooktimeRateLimitConfig,
): Promise<boolean> {
  const stored = readStoredSession(clubId);
  if (stored?.companyId === companyId && stored.accessToken && stored.refreshToken) {
    getBooktimeClient(clubId, companyId, clubTimeZone, rateLimitConfig);
    return true;
  }

  const res = await booktimeApi.getSessionToken(clubId);
  if (!res.success || !res.data) {
    // If backend has no stored tokens (404), check if we have a refreshToken in sessionStorage
    // that we can use to attempt a direct refresh with Booktime API
    const fallbackStored = readStoredSession(clubId);
    if (fallbackStored?.refreshToken && fallbackStored.companyId === companyId) {
      const client = createClient(clubId, companyId, fallbackStored, clubTimeZone, rateLimitConfig);
      // Try to refresh using the stored refreshToken
      const refreshed = await client.refreshAccessToken();
      if (refreshed) {
        const newTokens = client.getTokens();
        if (newTokens.accessToken && newTokens.refreshToken) {
          const updated: BooktimeStoredSession = {
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            externalUserId: fallbackStored.externalUserId,
            companyId,
          };
          writeStoredSession(clubId, updated);
          // Sync the refreshed tokens to backend
          void booktimeApi.putAuth(clubId, {
            accessToken: updated.accessToken,
            refreshToken: updated.refreshToken,
            externalUserId: updated.externalUserId,
          });
          return true;
        }
      }
    }
    throw new Error(
      formatBooktimeErrorMessage(
        { message: res.message },
        BOOKING_ERROR_KEYS.sessionExpired,
      ),
    );
  }

  const session: BooktimeStoredSession = {
    accessToken: res.data.accessToken,
    refreshToken: res.data.refreshToken,
    externalUserId: res.data.externalUserId,
    companyId,
  };
  writeStoredSession(clubId, session);
  memoryClients.set(clubId, {
    client: createClient(clubId, companyId, session, clubTimeZone, rateLimitConfig),
    companyId,
    externalUserId: session.externalUserId,
  });
  return true;
}

export async function persistBooktimeSessionAfterConnect(
  clubId: string,
  companyId: string,
  payload: {
    accessToken: string;
    refreshToken: string;
    externalUserId: string;
    phoneNumber?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
  clubTimeZone?: string | null,
  rateLimitConfig?: BooktimeRateLimitConfig,
): Promise<void> {
  const session: BooktimeStoredSession = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    externalUserId: payload.externalUserId,
    companyId,
  };
  writeStoredSession(clubId, session);
  memoryClients.set(clubId, {
    client: createClient(clubId, companyId, session, clubTimeZone, rateLimitConfig),
    companyId,
    externalUserId: payload.externalUserId,
  });

  await booktimeApi.putAuth(clubId, {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    externalUserId: payload.externalUserId,
    phoneNumber: payload.phoneNumber ?? null,
    firstName: payload.firstName ?? null,
    lastName: payload.lastName ?? null,
  });
}

export async function disconnectBooktimeClub(clubId: string): Promise<void> {
  await booktimeApi.deleteAuth(clubId);
  clearProactiveBooktimeRefresh(clubId);
  clearRateLimitState(clubId);
  clearStoredSession(clubId);
  memoryClients.delete(clubId);
}

export function clearBooktimeSessionLocal(clubId: string): void {
  clearProactiveBooktimeRefresh(clubId);
  clearRateLimitState(clubId);
  clearStoredSession(clubId);
  memoryClients.delete(clubId);
}

export function ensureBooktimeProactiveRefresh(rateLimitConfig?: BooktimeRateLimitConfig): void {
  restoreProactiveBooktimeRefreshForStoredSessions(listStoredBooktimeClubIds, (clubId) => {
    const stored = readStoredSession(clubId);
    if (!stored?.accessToken || !stored.refreshToken) return null;
    return getBooktimeClient(clubId, stored.companyId, undefined, rateLimitConfig);
  });
}

export function hasBooktimeSession(clubId: string): boolean {
  return !!readStoredSession(clubId);
}

export function getBooktimeExternalUserId(clubId: string): string | null {
  const stored = readStoredSession(clubId);
  return stored?.externalUserId ?? memoryClients.get(clubId)?.externalUserId ?? null;
}
