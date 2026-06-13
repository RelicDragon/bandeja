import { useCallback, useEffect, useState } from 'react';
import {
  fetchUserBooktimeBookingIds,
  type UserBooktimeBookingIdsResult,
} from '@/integrations/booktime/userBookingsCheck';

export function useBooktimeUserBookingIds(
  clubId: string | null | undefined,
  companyId: string | null | undefined,
  enabled: boolean,
) {
  const [state, setState] = useState<UserBooktimeBookingIdsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async (): Promise<UserBooktimeBookingIdsResult | null> => {
    if (!enabled || !clubId || !companyId) {
      setState(null);
      return null;
    }
    setLoading(true);
    try {
      const result = await fetchUserBooktimeBookingIds(clubId, companyId);
      setState(result);
      return result;
    } catch {
      setState({ authenticated: false, ids: new Set() });
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled, clubId, companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isOwner = useCallback(
    (externalBookingId: string) =>
      state?.authenticated === true && state.ids.has(externalBookingId),
    [state],
  );

  return {
    loading,
    isBooktimeConnected: state?.authenticated ?? false,
    isOwner,
    reload,
  };
}
