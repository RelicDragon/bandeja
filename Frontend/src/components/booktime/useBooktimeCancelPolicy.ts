import { useEffect, useMemo, useState } from 'react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { loadBooktimeCompany } from '@/integrations/booktime/bookFlow';
import { getBooktimeClient, hydrateBooktimeSession } from '@/integrations/booktime/session';
import { resolveBooktimeMyClubTimezone } from './booktimeBookingUtils';

export const DEFAULT_BOOKTIME_CANCEL_HOURS = 12;

function resolveAllowedHours(company: { allowedHoursToCancel?: number }): number {
  if (typeof company.allowedHoursToCancel === 'number' && company.allowedHoursToCancel > 0) {
    return company.allowedHoursToCancel;
  }
  return DEFAULT_BOOKTIME_CANCEL_HOURS;
}

async function loadClubCancelHours(club: BooktimeMyClubRow): Promise<number> {
  if (!club.companyId) return DEFAULT_BOOKTIME_CANCEL_HOURS;
  try {
    const clubTimeZone = resolveBooktimeMyClubTimezone(club);
    await hydrateBooktimeSession(club.clubId, club.companyId, clubTimeZone);
    const client = getBooktimeClient(club.clubId, club.companyId, clubTimeZone);
    const company = await loadBooktimeCompany(client, club.companyId);
    return resolveAllowedHours(company);
  } catch {
    return DEFAULT_BOOKTIME_CANCEL_HOURS;
  }
}

export function resolveBooktimeCancelHoursForClub(
  clubId: string | undefined,
  byClubId: ReadonlyMap<string, number> | undefined,
  fallbackHours: number = DEFAULT_BOOKTIME_CANCEL_HOURS,
): number {
  const fromMap = clubId ? byClubId?.get(clubId) : undefined;
  return fromMap ?? fallbackHours;
}

export function useBooktimeCancelPolicy(club: BooktimeMyClubRow | null, enabled: boolean) {
  const [allowedHoursToCancel, setAllowedHoursToCancel] = useState(DEFAULT_BOOKTIME_CANCEL_HOURS);

  useEffect(() => {
    if (!enabled || !club?.connected || !club.companyId) return;
    let cancelled = false;
    void (async () => {
      const hours = await loadClubCancelHours(club);
      if (!cancelled) setAllowedHoursToCancel(hours);
    })();
    return () => {
      cancelled = true;
    };
  }, [club, enabled]);

  return allowedHoursToCancel;
}

export function useBooktimeCancelPoliciesForClubs(clubs: BooktimeMyClubRow[], enabled: boolean) {
  const connectedClubs = useMemo(
    () => clubs.filter((c) => c.connected && c.companyId),
    [clubs],
  );
  const connectedKey = useMemo(
    () => connectedClubs.map((c) => `${c.clubId}:${c.companyId}`).join('|'),
    [connectedClubs],
  );
  const [byClubId, setByClubId] = useState<ReadonlyMap<string, number>>(() => new Map());

  useEffect(() => {
    if (!enabled || connectedClubs.length === 0) {
      setByClubId(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        connectedClubs.map(async (club) => [club.clubId, await loadClubCancelHours(club)] as const),
      );
      if (!cancelled) setByClubId(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [connectedKey, connectedClubs, enabled]);

  return byClubId;
}
