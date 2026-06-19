import { booktimeApi } from '@/api/booktime';
import { BooktimeClient } from './client';
import { formatBooktimeErrorMessage } from './formatBooktimeErrorMessage';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import {
  booktimeAccessTokenExpiresAtIso,
  isBooktimeAccessTokenExpired,
} from './booktimeAccessToken';
import { syncBooktimeTokensToBackend } from './booktimeBackendSync';
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
const hydrateInFlight = new Map<string, Promise<boolean>>();
const sessionBlockedUntil = new Map<string, number>();

const SESSION_RETRY_COOLDOWN_MS = 30_000;

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

function withSessionExpiry(session: BooktimeStoredSession): BooktimeStoredSession {
  return {
    ...session,
    expiresAt: session.expiresAt ?? booktimeAccessTokenExpiresAtIso(session.accessToken),
  };
}

function scheduleBackendTokenSync(clubId: string, session: BooktimeStoredSession): void {
  const existing = backendSyncTimers.get(clubId);
  if (existing) clearTimeout(existing);
  backendSyncTimers.set(
    clubId,
    setTimeout(() => {
      backendSyncTimers.delete(clubId);
      void syncBooktimeTokensToBackend(clubId, withSessionExpiry(session));
    }, 500),
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
  sessionStorage.setItem(
    booktimeSessionStorageKey(clubId),
    JSON.stringify(withSessionExpiry(session)),
  );
}

function clearStoredSession(clubId: string): void {
  sessionStorage.removeItem(booktimeSessionStorageKey(clubId));
}

function notifyReconnect(clubId: string): void {
  reconnectListeners.get(clubId)?.forEach((fn) => fn());
}

function markSessionBlocked(clubId: string): void {
  sessionBlockedUntil.set(clubId, Date.now() + SESSION_RETRY_COOLDOWN_MS);
}

function isSessionBlocked(clubId: string): boolean {
  const until = sessionBlockedUntil.get(clubId);
  if (until == null) return false;
  if (Date.now() >= until) {
    sessionBlockedUntil.delete(clubId);
    return false;
  }
  return true;
}

function rememberClient(
  clubId: string,
  companyId: string,
  client: BooktimeClient,
  externalUserId: string | null,
): void {
  memoryClients.set(clubId, { client, companyId, externalUserId });
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
      const updated = withSessionExpiry({ ...current, accessToken, refreshToken });
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
      markSessionBlocked(clubId);
      notifyReconnect(clubId);
    },
  });
  if (stored?.accessToken && stored.refreshToken) {
    scheduleProactiveBooktimeRefresh(clubId, stored.accessToken, client);
  }
  return client;
}

async function refreshStoredSession(
  clubId: string,
  companyId: string,
  stored: BooktimeStoredSession,
  clubTimeZone?: string | null,
  rateLimitConfig?: BooktimeRateLimitConfig,
): Promise<boolean> {
  const client = createClient(clubId, companyId, stored, clubTimeZone, rateLimitConfig);
  rememberClient(clubId, companyId, client, stored.externalUserId);
  const refreshed = await client.refreshAccessToken();
  if (!refreshed) {
    clearStoredSession(clubId);
    memoryClients.delete(clubId);
    return false;
  }

  const tokens = client.getTokens();
  if (!tokens.accessToken || !tokens.refreshToken) {
    clearStoredSession(clubId);
    memoryClients.delete(clubId);
    return false;
  }

  const updated = withSessionExpiry({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    externalUserId: stored.externalUserId,
    companyId,
  });
  writeStoredSession(clubId, updated);
  void syncBooktimeTokensToBackend(clubId, updated);
  sessionBlockedUntil.delete(clubId);
  return true;
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
  rememberClient(clubId, companyId, client, stored?.externalUserId ?? null);
  return client;
}

export async function hydrateBooktimeSession(
  clubId: string,
  companyId: string,
  clubTimeZone?: string | null,
  rateLimitConfig?: BooktimeRateLimitConfig,
): Promise<boolean> {
  const existing = hydrateInFlight.get(clubId);
  if (existing) return existing;

  const run = hydrateBooktimeSessionOnce(clubId, companyId, clubTimeZone, rateLimitConfig).finally(() => {
    hydrateInFlight.delete(clubId);
  });
  hydrateInFlight.set(clubId, run);
  return run;
}

async function hydrateBooktimeSessionOnce(
  clubId: string,
  companyId: string,
  clubTimeZone?: string | null,
  rateLimitConfig?: BooktimeRateLimitConfig,
): Promise<boolean> {
  if (isSessionBlocked(clubId)) {
    throw new Error(
      formatBooktimeErrorMessage(
        { message: BOOKING_ERROR_KEYS.sessionExpired },
        BOOKING_ERROR_KEYS.sessionExpired,
      ),
    );
  }

  const stored = readStoredSession(clubId);
  const hasLocalSession =
    stored?.companyId === companyId && stored.accessToken && stored.refreshToken;

  if (hasLocalSession && !isBooktimeAccessTokenExpired(stored.accessToken)) {
    getBooktimeClient(clubId, companyId, clubTimeZone, rateLimitConfig);
    return true;
  }

  if (hasLocalSession && isBooktimeAccessTokenExpired(stored.accessToken)) {
    if (await refreshStoredSession(clubId, companyId, stored, clubTimeZone, rateLimitConfig)) {
      return true;
    }
  }

  const res = await booktimeApi.getSessionToken(clubId);
  if (res.success && res.data) {
    const session = withSessionExpiry({
      accessToken: res.data.accessToken,
      refreshToken: res.data.refreshToken,
      externalUserId: res.data.externalUserId,
      companyId,
      expiresAt: res.data.expiresAt,
    });
    writeStoredSession(clubId, session);
    rememberClient(
      clubId,
      companyId,
      createClient(clubId, companyId, session, clubTimeZone, rateLimitConfig),
      session.externalUserId,
    );
    sessionBlockedUntil.delete(clubId);
    return true;
  }

  const fallbackStored = readStoredSession(clubId);
  if (fallbackStored?.refreshToken && fallbackStored.companyId === companyId) {
    if (await refreshStoredSession(clubId, companyId, fallbackStored, clubTimeZone, rateLimitConfig)) {
      return true;
    }
  }

  throw new Error(
    formatBooktimeErrorMessage({ message: res.message }, BOOKING_ERROR_KEYS.sessionExpired),
  );
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
  const session = withSessionExpiry({
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    externalUserId: payload.externalUserId,
    companyId,
  });
  writeStoredSession(clubId, session);
  rememberClient(
    clubId,
    companyId,
    createClient(clubId, companyId, session, clubTimeZone, rateLimitConfig),
    payload.externalUserId,
  );

  await syncBooktimeTokensToBackend(clubId, session, {
    phoneNumber: payload.phoneNumber ?? null,
    firstName: payload.firstName ?? null,
    lastName: payload.lastName ?? null,
  });
  sessionBlockedUntil.delete(clubId);
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
  sessionBlockedUntil.delete(clubId);
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
