import { decodeJwtExpMs } from '@/api/authRefresh';
import type { BooktimeClient } from './client';

const ACCESS_LEEWAY_MS = ((): number => {
  const raw = import.meta.env.VITE_ACCESS_REFRESH_LEEWAY_MS as unknown;
  if (typeof raw === 'number' && raw > 0) return raw;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
})();

const MIN_REFRESH_INTERVAL_MS = 4000;

type ClubRefreshState = {
  timer: ReturnType<typeof setTimeout> | null;
  lastRefreshAt: number;
  client: BooktimeClient;
};

const clubStates = new Map<string, ClubRefreshState>();

function clearClubTimer(clubId: string): void {
  const state = clubStates.get(clubId);
  if (!state?.timer) return;
  clearTimeout(state.timer);
  state.timer = null;
}

async function runProactiveBooktimeRefresh(clubId: string, client: BooktimeClient): Promise<void> {
  const state = clubStates.get(clubId);
  if (!state) return;

  state.timer = null;

  const now = Date.now();
  if (state.lastRefreshAt > 0 && now - state.lastRefreshAt < MIN_REFRESH_INTERVAL_MS) {
    const accessToken = client.getTokens().accessToken;
    if (accessToken) scheduleProactiveBooktimeRefresh(clubId, accessToken, client);
    return;
  }

  const ok = await client.refreshAccessToken();
  state.lastRefreshAt = Date.now();

  if (ok) {
    const accessToken = client.getTokens().accessToken;
    if (accessToken) scheduleProactiveBooktimeRefresh(clubId, accessToken, client);
    return;
  }

  client.expireSession();
  clearProactiveBooktimeRefresh(clubId);
}

export function scheduleProactiveBooktimeRefresh(
  clubId: string,
  accessToken: string,
  client: BooktimeClient
): void {
  clearClubTimer(clubId);

  const expMs = decodeJwtExpMs(accessToken);
  if (!expMs) return;

  const msUntilExp = expMs - Date.now();
  if (msUntilExp <= 0) {
    void runProactiveBooktimeRefresh(clubId, client);
    return;
  }

  const desiredLeadMs = Math.min(ACCESS_LEEWAY_MS, Math.floor(msUntilExp * 0.5));
  const delay = Math.max(30_000, msUntilExp - desiredLeadMs);

  const existing = clubStates.get(clubId);
  const state: ClubRefreshState = existing ?? { timer: null, lastRefreshAt: 0, client };
  state.client = client;
  state.timer = setTimeout(() => {
    void runProactiveBooktimeRefresh(clubId, client);
  }, delay);
  clubStates.set(clubId, state);
}

export function clearProactiveBooktimeRefresh(clubId: string): void {
  clearClubTimer(clubId);
  clubStates.delete(clubId);
}

export function clearAllProactiveBooktimeRefresh(): void {
  for (const clubId of [...clubStates.keys()]) {
    clearProactiveBooktimeRefresh(clubId);
  }
}

export function restoreProactiveBooktimeRefreshForStoredSessions(
  listClubIds: () => string[],
  getClientForClub: (clubId: string) => BooktimeClient | null
): void {
  for (const clubId of listClubIds()) {
    const client = getClientForClub(clubId);
    const accessToken = client?.getTokens().accessToken;
    if (client && accessToken) {
      scheduleProactiveBooktimeRefresh(clubId, accessToken, client);
    }
  }
}
