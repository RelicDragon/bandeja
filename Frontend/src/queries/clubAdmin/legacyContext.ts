/**
 * Adapters from the legacy club row to console v2 shapes, for backends that do not serve
 * `GET /context` yet. A legacy backend has no roles: anyone it lets in is a full ADMIN.
 */
import {
  CLUB_ADMIN_CAPABILITIES,
  type ClubAdminContext,
  type ClubAdminCourtRef,
} from '@shared/clubAdmin/contract';
import { clubLocalDate, isClubTime } from '@shared/clubAdmin/clubTime';
import type { ClubAdminLegacyClub } from '@/api/clubAdmin';

export interface LegacyClubInfo {
  openingTime: string | null;
  closingTime: string | null;
  defaultSlotMinutes: number | null;
  courts: ClubAdminCourtRef[];
}

export interface ConsoleContext extends ClubAdminContext {
  apiVersion: 'v2' | 'legacy';
  /** Present in legacy mode: hours and courts the schedule falls back to. */
  legacy: LegacyClubInfo | null;
}

const FALLBACK_TZ = 'UTC';

export function legacyCourtsToRefs(club: Pick<ClubAdminLegacyClub, 'courts'>): ClubAdminCourtRef[] {
  return (club.courts ?? []).map((c, index) => ({
    id: c.id,
    name: c.name,
    isIndoor: !!c.isIndoor,
    sport: c.sport ?? null,
    isActive: c.isActive !== false,
    sortOrder: index,
  }));
}

export function legacyClubInfo(club: ClubAdminLegacyClub): LegacyClubInfo {
  return {
    openingTime: isClubTime(club.openingTime) ? club.openingTime : null,
    closingTime: isClubTime(club.closingTime) ? club.closingTime : null,
    defaultSlotMinutes: typeof club.defaultSlotMinutes === 'number' ? club.defaultSlotMinutes : null,
    courts: legacyCourtsToRefs(club),
  };
}

export function legacyContextFromClub(club: ClubAdminLegacyClub, now: Date = new Date()): ConsoleContext {
  const timezone = club.city?.timezone || FALLBACK_TZ;
  const info = legacyClubInfo(club);
  const photos = Array.isArray(club.photos) ? club.photos.length : 0;
  return {
    apiVersion: 'legacy',
    legacy: info,
    club: {
      id: club.id,
      name: club.name,
      avatar: club.avatar ?? null,
      cityName: club.city?.name ?? '',
      timezone,
      currency: club.currency || 'EUR',
      integrationType: club.integrationType ?? null,
      isActive: true,
    },
    role: 'ADMIN',
    capabilities: [...CLUB_ADMIN_CAPABILITIES],
    today: clubLocalDate(now, timezone),
    setup: {
      hasCourts: info.courts.some((c) => c.isActive),
      hasHours: !!info.openingTime && !!info.closingTime,
      hasPrices: (club.courts ?? []).some((c) => typeof c.pricePerHour === 'number' && c.pricePerHour > 0),
      hasPhotos: photos > 0 || !!club.avatar,
      hasContacts: !!(club.phone || club.email || club.website),
    },
  };
}
