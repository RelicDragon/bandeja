import { booktimeApi } from '@/api/booktime';
import { BooktimeClient } from './client';
import { booktimeSessionStorageKey, type BooktimeStoredSession } from './config';

type SessionEntry = {
  client: BooktimeClient;
  companyId: string;
  externalUserId: string | null;
};

const memoryClients = new Map<string, SessionEntry>();
const reconnectListeners = new Map<string, Set<() => void>>();

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

function createClient(clubId: string, companyId: string, stored: BooktimeStoredSession | null): BooktimeClient {
  const client = new BooktimeClient({
    companyId,
    accessToken: stored?.accessToken ?? null,
    refreshToken: stored?.refreshToken ?? null,
    onTokensUpdated: ({ accessToken, refreshToken }) => {
      const current = readStoredSession(clubId);
      if (!current) return;
      writeStoredSession(clubId, { ...current, accessToken, refreshToken });
    },
    onSessionExpired: () => {
      clearStoredSession(clubId);
      memoryClients.delete(clubId);
      notifyReconnect(clubId);
    },
  });
  return client;
}

export function getBooktimeClient(clubId: string, companyId: string): BooktimeClient {
  const existing = memoryClients.get(clubId);
  if (existing && existing.companyId === companyId) {
    return existing.client;
  }

  const stored = readStoredSession(clubId);
  const client = createClient(clubId, companyId, stored?.companyId === companyId ? stored : null);
  memoryClients.set(clubId, {
    client,
    companyId,
    externalUserId: stored?.externalUserId ?? null,
  });
  return client;
}

export async function hydrateBooktimeSession(
  clubId: string,
  companyId: string
): Promise<boolean> {
  const stored = readStoredSession(clubId);
  if (stored?.companyId === companyId && stored.accessToken && stored.refreshToken) {
    getBooktimeClient(clubId, companyId);
    return true;
  }

  const res = await booktimeApi.getSessionToken(clubId);
  if (!res.success || !res.data) return false;

  const session: BooktimeStoredSession = {
    accessToken: res.data.accessToken,
    refreshToken: res.data.refreshToken,
    externalUserId: res.data.externalUserId,
    companyId,
  };
  writeStoredSession(clubId, session);
  memoryClients.set(clubId, {
    client: createClient(clubId, companyId, session),
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
  }
): Promise<void> {
  const session: BooktimeStoredSession = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    externalUserId: payload.externalUserId,
    companyId,
  };
  writeStoredSession(clubId, session);
  memoryClients.set(clubId, {
    client: createClient(clubId, companyId, session),
    companyId,
    externalUserId: payload.externalUserId,
  });

  await booktimeApi.putAuth(clubId, {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    externalUserId: payload.externalUserId,
    phoneNumber: payload.phoneNumber ?? null,
  });
}

export async function disconnectBooktimeClub(clubId: string): Promise<void> {
  await booktimeApi.deleteAuth(clubId);
  clearStoredSession(clubId);
  memoryClients.delete(clubId);
}

export function clearBooktimeSessionLocal(clubId: string): void {
  clearStoredSession(clubId);
  memoryClients.delete(clubId);
}

export function hasBooktimeSession(clubId: string): boolean {
  return !!readStoredSession(clubId);
}

export function getBooktimeExternalUserId(clubId: string): string | null {
  const stored = readStoredSession(clubId);
  return stored?.externalUserId ?? memoryClients.get(clubId)?.externalUserId ?? null;
}
