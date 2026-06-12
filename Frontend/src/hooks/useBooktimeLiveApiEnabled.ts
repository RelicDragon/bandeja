import { useCallback, useEffect, useState } from 'react';
import { booktimeApi } from '@/api/booktime';
import { useAuthStore } from '@/store/authStore';

export async function resolveBooktimeLiveApiEnabled(clubId: string): Promise<boolean> {
  const [scoutRes, authRes] = await Promise.all([
    booktimeApi.getScoutToken(clubId),
    booktimeApi.getAuth(clubId),
  ]);
  if (authRes.data?.connected) return true;
  return scoutRes.data?.available === true;
}

export function useBooktimeLiveApiEnabled(clubId: string | undefined, enabled: boolean) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [apiEnabled, setApiEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !clubId || !isAuthenticated) {
      setApiEnabled(false);
      return false;
    }
    setLoading(true);
    try {
      const ok = await resolveBooktimeLiveApiEnabled(clubId);
      setApiEnabled(ok);
      return ok;
    } catch {
      setApiEnabled(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, [clubId, enabled, isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { apiEnabled, loading, refresh };
}
