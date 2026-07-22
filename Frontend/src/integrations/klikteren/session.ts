import { klikterenApi } from '@/api/klikteren';
import { KlikterenClient } from './client';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import { syncKlikterenTokensToBackend } from './klikterenBackendSync';
import {
  klikterenSessionStorageKey,
  KLIKTEREN_SESSION_STORAGE_PREFIX,
  type KlikterenStoredSession,
} from './config';

type SessionEntry = {
  client: KlikterenClient;
  klikterenVenueId: string;
  externalUserId: string | null;
};

const memoryClients = new Map<string, SessionEntry>();
const reconnectListeners = new Map<string, Set<() => void>>();
const backendSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const hydrateInFlight = new Map<string, Promise<boolean>>();
const sessionBlockedUntil = new Map<string, number>();

const SESSION_RETRY_COOLDOWN_MS = 30_000;

function listStoredKlikterenClubIds(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(KLIKTEREN_SESSION_STORAGE_PREFIX)) {
      ids.push(key.slice(KLIKTEREN_SESSION_STORAGE_PREFIX.length));
    }
  }
  return ids;
}

function scheduleBackendTokenSync(clubId: string, session: KlikterenStoredSession): void {
  const existing = backendSyncTimers.get(clubId);
  if (existing) clearTimeout(existing);
  backendSyncTimers.set(
    clubId,
    setTimeout(() => {
      backendSyncTimers.delete(clubId);
      void syncKlikterenTokensToBackend(clubId, session);
    }, 500),
  );
}

function readStoredSession(clubId: string): KlikterenStoredSession | null {
  const raw = sessionStorage.getItem(klikterenSessionStorageKey(clubId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as KlikterenStoredSession;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.externalUserId === 'string' &&
      typeof parsed.klikterenVenueId === 'string'
    ) {
      return parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

function writeStoredSession(clubId: string, session: KlikterenStoredSession): void {
  sessionStorage.setItem(klikterenSessionStorageKey(clubId), JSON.stringify(session));
}

function clearStoredSession(clubId: string): void {
  sessionStorage.removeItem(klikterenSessionStorageKey(clubId));
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
  klikterenVenueId: string,
  client: KlikterenClient,
  externalUserId: string | null,
): void {
  memoryClients.set(clubId, { client, klikterenVenueId, externalUserId });
}

export function onKlikterenReconnectRequired(clubId: string, listener: () => void): () => void {
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
  klikterenVenueId: string,
  stored: KlikterenStoredSession | null,
): KlikterenClient {
  return new KlikterenClient({
    klikterenVenueId,
    accessToken: stored?.accessToken ?? null,
    onTokenUpdated: (accessToken) => {
      const current = readStoredSession(clubId);
      if (!current) return;
      const updated = { ...current, accessToken };
      writeStoredSession(clubId, updated);
      scheduleBackendTokenSync(clubId, updated);
    },
    onSessionExpired: () => {
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
}

export function getKlikterenClient(clubId: string, klikterenVenueId: string): KlikterenClient {
  const existing = memoryClients.get(clubId);
  if (existing && existing.klikterenVenueId === klikterenVenueId) {
    return existing.client;
  }

  const stored = readStoredSession(clubId);
  const client = createClient(
    clubId,
    klikterenVenueId,
    stored?.klikterenVenueId === klikterenVenueId ? stored : null,
  );
  rememberClient(clubId, klikterenVenueId, client, stored?.externalUserId ?? null);
  return client;
}

export async function hydrateKlikterenSession(clubId: string, klikterenVenueId: string): Promise<boolean> {
  const existing = hydrateInFlight.get(clubId);
  if (existing) return existing;

  const run = hydrateKlikterenSessionOnce(clubId, klikterenVenueId).finally(() => {
    hydrateInFlight.delete(clubId);
  });
  hydrateInFlight.set(clubId, run);
  return run;
}

async function hydrateKlikterenSessionOnce(clubId: string, klikterenVenueId: string): Promise<boolean> {
  if (isSessionBlocked(clubId)) {
    throw new Error(BOOKING_ERROR_KEYS.sessionExpired);
  }

  const stored = readStoredSession(clubId);
  if (stored?.klikterenVenueId === klikterenVenueId && stored.accessToken) {
    rememberClient(
      clubId,
      klikterenVenueId,
      createClient(clubId, klikterenVenueId, stored),
      stored.externalUserId,
    );
    return true;
  }

  let sessionRes: Awaited<ReturnType<typeof klikterenApi.getSessionToken>> | null = null;
  try {
    sessionRes = await klikterenApi.getSessionToken(clubId);
  } catch {
    sessionRes = null;
  }

  if (sessionRes?.success && sessionRes.data) {
    const session: KlikterenStoredSession = {
      accessToken: sessionRes.data.accessToken,
      externalUserId: sessionRes.data.externalUserId,
      klikterenVenueId,
      email: stored?.email ?? null,
    };
    writeStoredSession(clubId, session);
    rememberClient(
      clubId,
      klikterenVenueId,
      createClient(clubId, klikterenVenueId, session),
      session.externalUserId,
    );
    sessionBlockedUntil.delete(clubId);
    return true;
  }

  const fallbackStored = readStoredSession(clubId);
  if (fallbackStored?.accessToken && fallbackStored.klikterenVenueId === klikterenVenueId) {
    rememberClient(
      clubId,
      klikterenVenueId,
      createClient(clubId, klikterenVenueId, fallbackStored),
      fallbackStored.externalUserId,
    );
    return true;
  }

  throw new Error(sessionRes?.message ?? BOOKING_ERROR_KEYS.sessionExpired);
}

export async function persistKlikterenSessionAfterConnect(
  clubId: string,
  klikterenVenueId: string,
  payload: {
    accessToken: string;
    externalUserId: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
): Promise<void> {
  const session: KlikterenStoredSession = {
    accessToken: payload.accessToken,
    externalUserId: payload.externalUserId,
    klikterenVenueId,
    email: payload.email ?? null,
  };
  writeStoredSession(clubId, session);
  rememberClient(
    clubId,
    klikterenVenueId,
    createClient(clubId, klikterenVenueId, session),
    payload.externalUserId,
  );

  await syncKlikterenTokensToBackend(clubId, session, {
    email: payload.email ?? null,
    firstName: payload.firstName ?? null,
    lastName: payload.lastName ?? null,
  });
  sessionBlockedUntil.delete(clubId);
}

export async function disconnectKlikterenClub(clubId: string): Promise<void> {
  const stored = readStoredSession(clubId);
  if (stored?.accessToken && stored.klikterenVenueId) {
    try {
      const client = getKlikterenClient(clubId, stored.klikterenVenueId);
      client.applyToken(stored.accessToken);
      await client.signOut();
    } catch {
      /* best-effort remote revoke */
    }
  }
  await klikterenApi.deleteAuth(clubId);
  clearStoredSession(clubId);
  memoryClients.delete(clubId);
  sessionBlockedUntil.delete(clubId);
}

export function clearKlikterenSessionLocal(clubId: string): void {
  clearStoredSession(clubId);
  memoryClients.delete(clubId);
  sessionBlockedUntil.delete(clubId);
}

export function hasKlikterenSession(clubId: string): boolean {
  return !!readStoredSession(clubId);
}

export function getKlikterenExternalUserId(clubId: string): string | null {
  const stored = readStoredSession(clubId);
  return stored?.externalUserId ?? memoryClients.get(clubId)?.externalUserId ?? null;
}

export function listKlikterenSessionClubIds(): string[] {
  return listStoredKlikterenClubIds();
}
