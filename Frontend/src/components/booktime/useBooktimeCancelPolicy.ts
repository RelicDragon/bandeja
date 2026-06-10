import { useEffect, useState } from 'react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { loadBooktimeCompany } from '@/integrations/booktime/bookFlow';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';

export function useBooktimeCancelPolicy(club: BooktimeMyClubRow | null, enabled: boolean) {
  const [allowedHoursToCancel, setAllowedHoursToCancel] = useState(12);

  useEffect(() => {
    if (!enabled || !club?.connected || !club.companyId) return;
    void (async () => {
      try {
        await hydrateBooktimeSession(club.clubId, club.companyId!);
        const client = getBooktimeClient(club.clubId, club.companyId!);
        const company = await loadBooktimeCompany(client, club.companyId!);
        if (typeof company.allowedHoursToCancel === 'number' && company.allowedHoursToCancel > 0) {
          setAllowedHoursToCancel(company.allowedHoursToCancel);
        }
      } catch {
        /* keep default */
      }
    })();
  }, [club?.clubId, club?.companyId, club?.connected, enabled]);

  return allowedHoursToCancel;
}
