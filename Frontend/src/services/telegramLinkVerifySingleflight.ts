import type { ApiResponse, LoginResponse } from '@/types';
import { authApi, type RegistrationPrimarySport } from '@/api/auth';

const IN_FLIGHT = new Map<string, Promise<ApiResponse<LoginResponse>>>();
const REPLAY_TTL_MS = 120_000;
const replayByKey = new Map<string, { expiresAt: number; data: ApiResponse<LoginResponse> }>();

function pruneReplay() {
  const now = Date.now();
  for (const [k, v] of replayByKey) {
    if (v.expiresAt <= now) replayByKey.delete(k);
  }
}

export function verifyTelegramLinkKeySingleflight(
  key: string,
  language: string | undefined,
  opts?: { withAuth?: boolean; primarySport?: RegistrationPrimarySport }
): Promise<ApiResponse<LoginResponse>> {
  pruneReplay();
  const cached = replayByKey.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data);
  }

  const existing = IN_FLIGHT.get(key);
  if (existing) return existing;

  const run = authApi
    .verifyTelegramLinkKey({ key, language, primarySport: opts?.primarySport }, opts)
    .then((data) => {
      replayByKey.set(key, { expiresAt: Date.now() + REPLAY_TTL_MS, data });
      return data;
    })
    .finally(() => {
      if (IN_FLIGHT.get(key) === run) IN_FLIGHT.delete(key);
    });

  IN_FLIGHT.set(key, run);
  return run;
}
