import { useAuthStore } from '@/store/authStore';
import { weltnerApi } from '@/api/weltner';
import { useCallback, useEffect, useRef, useState } from 'react';
import { booktimeApi, type BooktimeAuthStatus } from '@/api/booktime';
import { padelooApi, type PadelooAuthStatus } from '@/api/padeloo';
import { klikterenApi, type KlikterenAuthStatus } from '@/api/klikteren';
import { isBooktimeClub, isWeltnerClub, isKlikterenClub, isNspadelClub, isPadelooClub, type ClubIntegrationRef } from '@shared/clubIntegration';
import { onBookingAuthInvalidated } from '@/integrations/booking/bookingAuthInvalidation';

export type ClubBookingAuthStatus = {
  connected: boolean;
  phoneNumber?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  externalUserId?: string | null;
  scoutOptIn?: boolean;
  integrationType?: 'BOOKTIME' | 'PADELOO' | 'KLIKTEREN' | 'WELTNER';
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
  const userId = useAuthStore((state) => state.user?.id);
  const weltner = isWeltnerClub(club);
  const weltnerUserId = weltner ? userId : undefined;
  const weltnerKey = `${weltnerUserId}:${clubId}`;
  const [resolvedWeltnerKey, setResolvedWeltnerKey] = useState<string | null>(null);
  const [status, setStatus] = useState<ClubBookingAuthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    if (!clubId || !enabled || !club || (weltner && !weltnerUserId)) {
      setStatus(null);
      setLoading(false);
      return null;
    }

    setStatus(null);
    setLoading(true);
    try {
      if (isWeltnerClub(club)) {
        const res = await weltnerApi.getAuth(clubId);
        const next: ClubBookingAuthStatus = { connected: res.data?.connected ?? false, phoneNumber: res.data?.phoneNumber, integrationType: 'WELTNER' };
        if (generation.current !== current) return null;
        setResolvedWeltnerKey(weltnerKey);
        setStatus(next); return next;
      }
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
        if (generation.current !== current) return null;
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
        if (generation.current !== current) return null;
        setStatus(next);
        return next;
      }

      // NS Padel Centar needs no external account: bookings are made under
      // the player's Bandeja profile contact details, so it is always connected.
      if (isNspadelClub(club)) {
        const next: ClubBookingAuthStatus = { connected: true };
        if (generation.current !== current) return null;
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
        if (generation.current !== current) return null;
        setStatus(next);
        return next;
      }

      setStatus(null);
      return null;
    } catch {
      if (generation.current === current) setStatus(null);
      return null;
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [club, clubId, enabled, weltner, weltnerUserId, weltnerKey]);

  useEffect(() => {
    const guard = generation;
    void refresh();
    return () => { guard.current++; };
  }, [refresh]);

  useEffect(() => {
    if (!clubId || !enabled) return;
    return onBookingAuthInvalidated((event) => {
      if (event.clubId === clubId) {
        void refresh();
      }
    });
  }, [clubId, enabled, refresh]);

  return { status: weltner && (!enabled || !weltnerUserId || resolvedWeltnerKey !== weltnerKey) ? null : status, loading, refresh };
}
