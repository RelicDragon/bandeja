import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import type { Club } from '@/types';
import { BooktimeClient } from '@/integrations/booktime/client';
import { loadBooktimeCompany } from '@/integrations/booktime/bookFlow';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { clubLocalDateString } from '@/utils/clubAdmin/scheduleTime';
import { getBooktimeCompanyId } from '@shared/clubIntegration';

export const DEFAULT_BOOKABLE_DAYS = 14;

export function useBooktimeCompanyMeta(club: Club | undefined, enabled: boolean) {
  const [bookableDays, setBookableDays] = useState(DEFAULT_BOOKABLE_DAYS);
  const [allowedHoursToCancel, setAllowedHoursToCancel] = useState(12);
  const [currency, setCurrency] = useState('RSD');
  const [loading, setLoading] = useState(false);

  const companyId = getBooktimeCompanyId(club) ?? undefined;

  useEffect(() => {
    if (!enabled || !companyId) {
      setBookableDays(DEFAULT_BOOKABLE_DAYS);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const client = new BooktimeClient({ companyId });
        const company = await loadBooktimeCompany(client, companyId);
        if (cancelled) return;
        if (typeof company.bookableDays === 'number' && company.bookableDays > 0) {
          setBookableDays(company.bookableDays);
        }
        if (typeof company.allowedHoursToCancel === 'number' && company.allowedHoursToCancel > 0) {
          setAllowedHoursToCancel(company.allowedHoursToCancel);
        }
        if (company.currency?.trim()) {
          setCurrency(company.currency.trim());
        }
      } catch {
        if (!cancelled) setBookableDays(DEFAULT_BOOKABLE_DAYS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [club?.id, companyId, enabled]);

  const allowedDateKeys = useMemo(() => {
    if (!club || !enabled) return [];
    const todayKey = clubLocalDateString(club);
    const [y, m, d] = todayKey.split('-').map(Number);
    const start = new Date(y, m - 1, d, 12, 0, 0);
    return Array.from({ length: bookableDays }, (_, i) => formatClubDateKey(addDays(start, i), club));
  }, [bookableDays, club, enabled]);

  const fixedDates = useMemo(() => {
    if (!club || !enabled || allowedDateKeys.length === 0) return undefined;
    return allowedDateKeys.map((key) => {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    });
  }, [allowedDateKeys, club, enabled]);

  const minDateKey = useMemo(() => (club ? clubLocalDateString(club) : ''), [club]);
  const maxDateKey = useMemo(
    () => (allowedDateKeys.length > 0 ? allowedDateKeys[allowedDateKeys.length - 1]! : ''),
    [allowedDateKeys],
  );

  const clampDate = useCallback(
    (date: Date): Date => {
      if (!club || allowedDateKeys.length === 0) return date;
      const key = formatClubDateKey(date, club);
      if (allowedDateKeys.includes(key)) return date;
      if (key < minDateKey) {
        const [y, m, d] = minDateKey.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0);
      }
      const [y, m, d] = maxDateKey.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    },
    [allowedDateKeys, club, maxDateKey, minDateKey],
  );

  return {
    bookableDays,
    allowedHoursToCancel,
    currency,
    loading,
    fixedDates,
    minDateKey,
    maxDateKey,
    clampDate,
  };
}
