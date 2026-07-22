import { useCallback, useEffect, useState } from 'react';
import { booktimeApi, type BooktimeAuthStatus } from '@/api/booktime';
import { padelooApi, type PadelooAuthStatus } from '@/api/padeloo';
import { klikterenApi, type KlikterenAuthStatus } from '@/api/klikteren';
import { isBooktimeClub, isKlikterenClub, isPadelooClub, type ClubIntegrationRef } from '@shared/clubIntegration';

export type ClubBookingAuthStatus = {
  connected: boolean;
  phoneNumber?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  externalUserId?: string | null;
  scoutOptIn?: boolean;
  integrationType?: 'BOOKTIME' | 'PADELOO' | 'KLIKTEREN';
};

function mapBooktimeStatus(status: BooktimeAuthStatus): ClubBookingAuthStatus {
  return {
    connected: status.connected,
    phoneNumber: status.phoneNumber,
    firstName: status.firstName,
    lastName: status.lastName,
    externalUserId: status.externalUserId,
    scoutOptIn: status.scoutOptIn,
    integrationType: 'BOOKTIME',
  };
}

function mapPadelooStatus(status: PadelooAuthStatus): ClubBookingAuthStatus {
  return {
    connected: status.connected,
    email: status.email,
    firstName: status.firstName,
    lastName: status.lastName,
    externalUserId: status.externalUserId,
    scoutOptIn: status.scoutOptIn,
    integrationType: 'PADELOO',
  };
}

function mapKlikterenStatus(status: KlikterenAuthStatus): ClubBookingAuthStatus {
  return {
    connected: status.connected,
    email: status.email,
    firstName: status.firstName,
    lastName: status.lastName,
    externalUserId: status.externalUserId,
    scoutOptIn: status.scoutOptIn,
    integrationType: 'KLIKTEREN',
  };
}

export function useClubBookingAuth(club: (ClubIntegrationRef & { id: string }) | undefined, enabled: boolean) {
  const clubId = club?.id;
  const [status, setStatus] = useState<ClubBookingAuthStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!clubId || !enabled || !club) {
      setStatus(null);
      return null;
    }

    setStatus(null);
    setLoading(true);
    try {
      if (isKlikterenClub(club)) {
        const res = await klikterenApi.getAuth(clubId);
        const next = mapKlikterenStatus(
          res.data ?? {
            connected: false,
            email: null,
            firstName: null,
            lastName: null,
            externalUserId: null,
            scoutOptIn: true,
          },
        );
        setStatus(next);
        return next;
      }

      if (isPadelooClub(club)) {
        const res = await padelooApi.getAuth(clubId);
        const next = mapPadelooStatus(
          res.data ?? {
            connected: false,
            email: null,
            firstName: null,
            lastName: null,
            externalUserId: null,
            scoutOptIn: true,
          },
        );
        setStatus(next);
        return next;
      }

      if (isBooktimeClub(club)) {
        const res = await booktimeApi.getAuth(clubId);
        const next = mapBooktimeStatus(
          res.data ?? {
            connected: false,
            phoneNumber: null,
            firstName: null,
            lastName: null,
            externalUserId: null,
            scoutOptIn: true,
          },
        );
        setStatus(next);
        return next;
      }

      setStatus(null);
      return null;
    } catch {
      setStatus(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [club, clubId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, refresh };
}
