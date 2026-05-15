import { useCallback, useEffect, useState } from 'react';
import { clubAdminApi, ClubAdminScheduleResponse } from '@/api/clubAdmin';

const POLL_MS = 10_000;

export function useClubAdminSchedule(clubId: string, date: string, courtId?: string) {
  const [data, setData] = useState<ClubAdminScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedule = useCallback(async () => {
    if (!clubId || !date) return;
    try {
      setError(null);
      const result = await clubAdminApi.getSchedule(clubId, date, courtId);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [clubId, date, courtId]);

  useEffect(() => {
    setLoading(true);
    fetchSchedule();
    const id = setInterval(fetchSchedule, POLL_MS);
    return () => clearInterval(id);
  }, [fetchSchedule]);

  return { data, loading, error, refetch: fetchSchedule };
}
