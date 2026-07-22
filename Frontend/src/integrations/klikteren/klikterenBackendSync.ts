import { klikterenApi } from '@/api/klikteren';
import type { KlikterenStoredSession } from './config';

const SYNC_ATTEMPTS = 3;
const SYNC_RETRY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function syncKlikterenTokensToBackend(
  clubId: string,
  session: KlikterenStoredSession,
  profile?: {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
): Promise<boolean> {
  for (let attempt = 0; attempt < SYNC_ATTEMPTS; attempt += 1) {
    try {
      const res = await klikterenApi.putAuth(clubId, {
        accessToken: session.accessToken,
        refreshToken: null,
        externalUserId: session.externalUserId,
        email: profile?.email ?? session.email,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
      });
      if (res.success) return true;
    } catch (err) {
      if (attempt === SYNC_ATTEMPTS - 1) {
        console.warn('[klikteren] backend token sync failed', { clubId, err });
      }
    }
    if (attempt < SYNC_ATTEMPTS - 1) {
      await sleep(SYNC_RETRY_MS * (attempt + 1));
    }
  }
  return false;
}
