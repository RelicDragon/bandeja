import { booktimeApi } from '@/api/booktime';
import { booktimeAccessTokenExpiresAtIso } from './booktimeAccessToken';
import type { BooktimeStoredSession } from './config';

const SYNC_ATTEMPTS = 3;
const SYNC_RETRY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function syncBooktimeTokensToBackend(
  clubId: string,
  session: BooktimeStoredSession,
  profile?: {
    phoneNumber?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
): Promise<boolean> {
  const expiresAt =
    session.expiresAt ?? booktimeAccessTokenExpiresAtIso(session.accessToken);

  for (let attempt = 0; attempt < SYNC_ATTEMPTS; attempt += 1) {
    try {
      const res = await booktimeApi.putAuth(clubId, {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        externalUserId: session.externalUserId,
        expiresAt,
        phoneNumber: profile?.phoneNumber,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
      });
      if (res.success) return true;
    } catch (err) {
      if (attempt === SYNC_ATTEMPTS - 1) {
        console.warn('[booktime] backend token sync failed', { clubId, err });
      }
    }
    if (attempt < SYNC_ATTEMPTS - 1) {
      await sleep(SYNC_RETRY_MS * (attempt + 1));
    }
  }
  return false;
}
