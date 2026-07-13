import { padelooApi } from '@/api/padeloo';
import { PadelooClient } from './client';
import { BOOKING_ERROR_KEYS } from '@shared/booking/errorKeys';
import { syncPadelooTokensToBackend } from './padelooBackendSync';
import {
  padelooSessionStorageKey,
  PADELOO_SESSION_STORAGE_PREFIX,
  type PadelooStoredSession,
} from './config';

type SessionEntry = {
  client: PadelooClient;
  padelooClubId: number;
  externalUserId: string | null;
};

const memoryClients = new Map<string, SessionEntry>();
const reconnectListeners = new Map<string, Set<() => void>>();
const backendSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const hydrateInFlight = new Map<string, Promise<boolean>>();
const sessionBlockedUntil = new Map<string, number>();

const SESSION_RETRY_COOLDOWN_MS = 30_000;

function listStoredPadelooClubIds(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(PADELOO_SESSION_STORAGE_PREFIX)) {
      ids.push(key.slice(PADELOO_SESSION_STORAGE_PREFIX.length));
    }
  }
  return ids;
}

function scheduleBackendTokenSync(clubId: string, session: PadelooStoredSession): void {
  const existing = backendSyncTimers.get(clubId);
  if (existing) clearTimeout(existing);
  backendSyncTimers.set(
    clubId,
    setTimeout(() => {
      backendSyncTimers.delete(clubId);
      void syncPadelooTokensToBackend(clubId, session);
    }, 500),
  );
}

function readStoredSession(clubId: string): PadelooStoredSession | null {
  const raw = sessionStorage.getItem(padelooSessionStorageKey(clubId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PadelooStoredSession;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.externalUserId === 'string' &&
      typeof parsed.padelooClubId === 'number'
    ) {
      return parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

function writeStoredSession(clubId: string, session: PadelooStoredSession): void {
  sessionStorage.setItem(padelooSessionStorageKey(clubId), JSON.stringify(session));
}

function clearStoredSession(clubId: string): void {
  sessionStorage.removeItem(padelooSessionStorageKey(clubId));
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
  padelooClubId: number,
  client: PadelooClient,
  externalUserId: string | null,
): void {
  memoryClients.set(clubId, { client, padelooClubId, externalUserId });
}

export function onPadelooReconnectRequired(clubId: string, listener: () => void): () => void {
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
  padelooClubId: number,
  stored: PadelooStoredSession | null,
): PadelooClient {
  return new PadelooClient({
    padelooClubId,
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

export function getPadelooClient(clubId: string, padelooClubId: number): PadelooClient {
  const existing = memoryClients.get(clubId);
  if (existing && existing.padelooClubId === padelooClubId) {
    return existing.client;
  }

  const stored = readStoredSession(clubId);
  const client = createClient(
    clubId,
    padelooClubId,
    stored?.padelooClubId === padelooClubId ? stored : null,
  );
  rememberClient(clubId, padelooClubId, client, stored?.externalUserId ?? null);
  return client;
}

export async function hydratePadelooSession(clubId: string, padelooClubId: number): Promise<boolean> {
  const existing = hydrateInFlight.get(clubId);
  if (existing) return existing;

  const run = hydratePadelooSessionOnce(clubId, padelooClubId).finally(() => {
    hydrateInFlight.delete(clubId);
  });
  hydrateInFlight.set(clubId, run);
  return run;
}

async function hydratePadelooSessionOnce(clubId: string, padelooClubId: number): Promise<boolean> {
  if (isSessionBlocked(clubId)) {
    throw new Error(BOOKING_ERROR_KEYS.sessionExpired);
  }

  const stored = readStoredSession(clubId);
  if (stored?.padelooClubId === padelooClubId && stored.accessToken) {
    rememberClient(
      clubId,
      padelooClubId,
      createClient(clubId, padelooClubId, stored),
      stored.externalUserId,
    );
    return true;
  }

  let sessionRes: Awaited<ReturnType<typeof padelooApi.getSessionToken>> | null = null;
  try {
    sessionRes = await padelooApi.getSessionToken(clubId);
  } catch {
    sessionRes = null;
  }

  if (sessionRes?.success && sessionRes.data) {
    const session: PadelooStoredSession = {
      accessToken: sessionRes.data.accessToken,
      externalUserId: sessionRes.data.externalUserId,
      padelooClubId,
      email: stored?.email ?? null,
    };
    writeStoredSession(clubId, session);
    rememberClient(
      clubId,
      padelooClubId,
      createClient(clubId, padelooClubId, session),
      session.externalUserId,
    );
    sessionBlockedUntil.delete(clubId);
    return true;
  }

  const fallbackStored = readStoredSession(clubId);
  if (fallbackStored?.accessToken && fallbackStored.padelooClubId === padelooClubId) {
    rememberClient(
      clubId,
      padelooClubId,
      createClient(clubId, padelooClubId, fallbackStored),
      fallbackStored.externalUserId,
    );
    return true;
  }

  throw new Error(sessionRes?.message ?? BOOKING_ERROR_KEYS.sessionExpired);
}

export async function persistPadelooSessionAfterConnect(
  clubId: string,
  padelooClubId: number,
  payload: {
    accessToken: string;
    externalUserId: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
): Promise<void> {
  const session: PadelooStoredSession = {
    accessToken: payload.accessToken,
    externalUserId: payload.externalUserId,
    padelooClubId,
    email: payload.email ?? null,
  };
  writeStoredSession(clubId, session);
  rememberClient(
    clubId,
    padelooClubId,
    createClient(clubId, padelooClubId, session),
    payload.externalUserId,
  );

  await syncPadelooTokensToBackend(clubId, session, {
    email: payload.email ?? null,
    firstName: payload.firstName ?? null,
    lastName: payload.lastName ?? null,
  });
  sessionBlockedUntil.delete(clubId);
}

export async function disconnectPadelooClub(clubId: string): Promise<void> {
  await padelooApi.deleteAuth(clubId);
  clearStoredSession(clubId);
  memoryClients.delete(clubId);
  sessionBlockedUntil.delete(clubId);
}

export function clearPadelooSessionLocal(clubId: string): void {
  clearStoredSession(clubId);
  memoryClients.delete(clubId);
  sessionBlockedUntil.delete(clubId);
}

export function hasPadelooSession(clubId: string): boolean {
  return !!readStoredSession(clubId);
}

export function getPadelooExternalUserId(clubId: string): string | null {
  const stored = readStoredSession(clubId);
  return stored?.externalUserId ?? memoryClients.get(clubId)?.externalUserId ?? null;
}

export function listPadelooSessionClubIds(): string[] {
  return listStoredPadelooClubIds();
}
