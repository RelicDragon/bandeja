import { useEffect, useState } from 'react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { loadBooktimeCompany } from '@/integrations/booktime/bookFlow';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { resolveBooktimeMyClubTimezone } from './booktimeBookingUtils';

const DEFAULT_CURRENCY = 'RSD';

export function useBooktimeClubCurrency(club: BooktimeMyClubRow): string | null {
  const [currency, setCurrency] = useState<string | null>(null);

  useEffect(() => {
    if (!club.companyId) {
      setCurrency(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const clubTimeZone = resolveBooktimeMyClubTimezone(club);
        await hydrateBooktimeSession(club.clubId, club.companyId!, clubTimeZone);
        const client = getBooktimeClient(club.clubId, club.companyId!, clubTimeZone);
        const company = await loadBooktimeCompany(client, club.companyId!);
        if (!cancelled) {
          setCurrency(company.currency?.trim() || DEFAULT_CURRENCY);
        }
      } catch {
        if (!cancelled) setCurrency(DEFAULT_CURRENCY);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [club]);

  return currency;
}
