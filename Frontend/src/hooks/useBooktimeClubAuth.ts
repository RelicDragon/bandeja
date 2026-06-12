import { useCallback, useEffect, useState } from 'react';
import { booktimeApi, type BooktimeAuthStatus } from '@/api/booktime';

export function useBooktimeClubAuth(clubId: string | undefined, enabled: boolean) {
  const [status, setStatus] = useState<BooktimeAuthStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!clubId || !enabled) {
      setStatus(null);
      return null;
    }
    setLoading(true);
    try {
      const res = await booktimeApi.getAuth(clubId);
      const next = res.data ?? {
        connected: false,
        phoneNumber: null,
        firstName: null,
        lastName: null,
        externalUserId: null,
        scoutOptIn: true,
      };
      setStatus(next);
      return next;
    } catch {
      setStatus(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [clubId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, refresh };
}
