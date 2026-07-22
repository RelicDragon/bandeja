import type { BooktimeMyClubRow } from '@/api/booktime';
import type { PadelooMyClubRow } from '@/api/padeloo';
import type { KlikterenMyClubRow } from '@/api/klikteren';
import type { ClubIntegrationType } from '@shared/clubIntegration';
import type { Club } from '@/types';

export type ConnectedBookingClubRow = {
  clubId: string;
  clubName: string;
  avatar: string | null;
  integrationType: ClubIntegrationType;
  connected: boolean;
  scoutOptIn: boolean;
  cityTimezone: string | null;
  courts: Array<{
    id: string;
    name: string;
    externalCourtId: string | null;
    integrationCourtName?: string | null;
  }>;
  companyId?: string | null;
  phoneNumber?: string | null;
  padelooClubId?: number | null;
  klikterenVenueId?: string | null;
  email?: string | null;
};

export type ConnectedBookingClubsPayload = {
  cityClubCount: number;
  connectedCount: number;
  clubs: ConnectedBookingClubRow[];
};

export function mapBooktimeClubRow(row: BooktimeMyClubRow): ConnectedBookingClubRow {
  return {
    clubId: row.clubId,
    clubName: row.clubName,
    avatar: row.avatar,
    integrationType: 'BOOKTIME',
    connected: row.connected,
    scoutOptIn: row.scoutOptIn,
    cityTimezone: row.cityTimezone,
    courts: row.courts,
    companyId: row.companyId,
    phoneNumber: row.phoneNumber,
  };
}

export function mapPadelooClubRow(row: PadelooMyClubRow): ConnectedBookingClubRow {
  return {
    clubId: row.clubId,
    clubName: row.clubName,
    avatar: row.avatar,
    integrationType: 'PADELOO',
    connected: row.connected,
    scoutOptIn: row.scoutOptIn,
    cityTimezone: row.cityTimezone,
    courts: row.courts,
    padelooClubId: row.padelooClubId,
    email: row.email,
  };
}

export function mapKlikterenClubRow(row: KlikterenMyClubRow): ConnectedBookingClubRow {
  return {
    clubId: row.clubId,
    clubName: row.clubName,
    avatar: row.avatar,
    integrationType: 'KLIKTEREN',
    connected: row.connected,
    scoutOptIn: row.scoutOptIn,
    cityTimezone: row.cityTimezone,
    courts: row.courts,
    klikterenVenueId: row.klikterenVenueId,
    email: row.email,
  };
}

export function mergeConnectedBookingClubs(
  booktime: BooktimeMyClubRow[],
  padeloo: PadelooMyClubRow[],
  klikteren: KlikterenMyClubRow[] = [],
): ConnectedBookingClubRow[] {
  const byId = new Map<string, ConnectedBookingClubRow>();
  for (const row of booktime) {
    byId.set(row.clubId, mapBooktimeClubRow(row));
  }
  for (const row of padeloo) {
    byId.set(row.clubId, mapPadelooClubRow(row));
  }
  for (const row of klikteren) {
    byId.set(row.clubId, mapKlikterenClubRow(row));
  }
  return [...byId.values()].sort((a, b) =>
    a.clubName.localeCompare(b.clubName, undefined, { sensitivity: 'base' }),
  );
}

export function connectedClubRowToBooktimeRow(row: ConnectedBookingClubRow): BooktimeMyClubRow {
  return {
    clubId: row.clubId,
    clubName: row.clubName,
    avatar: row.avatar,
    companyId: row.companyId ?? null,
    connected: row.connected,
    phoneNumber: row.phoneNumber ?? null,
    scoutOptIn: row.scoutOptIn,
    cityTimezone: row.cityTimezone,
    courts: row.courts,
  };
}

export type BookingListClubRow = BooktimeMyClubRow & {
  integrationType?: ClubIntegrationType;
  padelooClubId?: number | null;
  klikterenVenueId?: string | null;
};

export function connectedClubRowToBookingListClub(row: ConnectedBookingClubRow): BookingListClubRow {
  return {
    ...connectedClubRowToBooktimeRow(row),
    integrationType: row.integrationType,
    padelooClubId: row.padelooClubId ?? null,
    klikterenVenueId: row.klikterenVenueId ?? null,
  };
}

export function bookingListClubRowToClub(row: BookingListClubRow): Club {
  const courts = row.courts.map((c) => ({
    id: c.id,
    name: c.name,
    clubId: row.clubId,
    isIndoor: false,
    externalCourtId: c.externalCourtId ?? undefined,
    integrationCourtName: c.integrationCourtName ?? undefined,
  }));

  if (row.integrationType === 'KLIKTEREN' || row.klikterenVenueId) {
    return {
      id: row.clubId,
      name: row.clubName,
      address: '',
      cityId: '',
      integrationType: 'KLIKTEREN',
      integrationConfig: row.klikterenVenueId ? { venueId: row.klikterenVenueId } : null,
      courts,
    };
  }

  if (row.integrationType === 'PADELOO' || row.padelooClubId != null) {
    return {
      id: row.clubId,
      name: row.clubName,
      address: '',
      cityId: '',
      integrationType: 'PADELOO',
      integrationConfig: row.padelooClubId != null ? { clubId: row.padelooClubId } : null,
      courts,
    };
  }

  return {
    id: row.clubId,
    name: row.clubName,
    address: '',
    cityId: '',
    integrationType: 'BOOKTIME',
    integrationConfig: row.companyId ? { companyId: row.companyId } : null,
    courts,
  };
}
