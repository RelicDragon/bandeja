/** Keep in sync with Backend/src/shared/clubIntegration.ts */

export type ClubIntegrationType = 'BOOKTIME' | 'PADELOO' | 'KLIKTEREN';

export interface BooktimeIntegrationConfig {
  companyId: string;
  termsUrl?: string;
  privacyUrl?: string;
  serviceIds?: string[];
}

export interface PadelooIntegrationConfig {
  clubId: number;
}

export interface KlikterenIntegrationConfig {
  venueId: string;
}

export type ClubIntegrationConfig =
  | BooktimeIntegrationConfig
  | PadelooIntegrationConfig
  | KlikterenIntegrationConfig;

export type ClubIntegrationRef = {
  integrationType?: ClubIntegrationType | null;
  integrationConfig?: unknown;
};

export type CourtIntegrationRef = {
  id?: string;
  externalCourtId?: string | null;
};

export function parseBooktimeIntegrationConfig(raw: unknown): BooktimeIntegrationConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const companyId = (raw as Record<string, unknown>).companyId;
  if (typeof companyId !== 'string' || !companyId.trim()) return null;
  const config: BooktimeIntegrationConfig = { companyId: companyId.trim() };
  const termsUrl = (raw as Record<string, unknown>).termsUrl;
  const privacyUrl = (raw as Record<string, unknown>).privacyUrl;
  const serviceIds = (raw as Record<string, unknown>).serviceIds;
  if (typeof termsUrl === 'string' && termsUrl.trim()) config.termsUrl = termsUrl.trim();
  if (typeof privacyUrl === 'string' && privacyUrl.trim()) config.privacyUrl = privacyUrl.trim();
  if (Array.isArray(serviceIds)) {
    const ids = serviceIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    if (ids.length > 0) config.serviceIds = ids;
  }
  return config;
}

export function parsePadelooIntegrationConfig(raw: unknown): PadelooIntegrationConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const clubId = (raw as Record<string, unknown>).clubId;
  if (typeof clubId === 'number' && Number.isInteger(clubId) && clubId > 0) {
    return { clubId };
  }
  if (typeof clubId === 'string' && clubId.trim()) {
    const parsed = Number(clubId);
    if (Number.isInteger(parsed) && parsed > 0) return { clubId: parsed };
  }
  return null;
}

export function isBooktimeClub(club: ClubIntegrationRef | undefined): boolean {
  return club?.integrationType === 'BOOKTIME';
}

export function isPadelooClub(club: ClubIntegrationRef | undefined): boolean {
  return club?.integrationType === 'PADELOO';
}

export function parseKlikterenIntegrationConfig(raw: unknown): KlikterenIntegrationConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const venueId = (raw as Record<string, unknown>).venueId;
  if (typeof venueId !== 'string' || !venueId.trim()) return null;
  const trimmed = venueId.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
  ) {
    return null;
  }
  return { venueId: trimmed };
}

export function isKlikterenClub(club: ClubIntegrationRef | undefined): boolean {
  return club?.integrationType === 'KLIKTEREN';
}

export function getBooktimeCompanyId(club: ClubIntegrationRef | undefined): string | null {
  if (!isBooktimeClub(club)) return null;
  return parseBooktimeIntegrationConfig(club?.integrationConfig)?.companyId ?? null;
}

export function getPadelooClubId(club: ClubIntegrationRef | undefined): number | null {
  if (!isPadelooClub(club)) return null;
  return parsePadelooIntegrationConfig(club?.integrationConfig)?.clubId ?? null;
}

export function getKlikterenVenueId(club: ClubIntegrationRef | undefined): string | null {
  if (!isKlikterenClub(club)) return null;
  return parseKlikterenIntegrationConfig(club?.integrationConfig)?.venueId ?? null;
}

export function getExternalVenueId(club: ClubIntegrationRef | undefined): string | null {
  const booktimeId = getBooktimeCompanyId(club);
  if (booktimeId) return booktimeId;
  const klikterenId = getKlikterenVenueId(club);
  if (klikterenId) return klikterenId;
  const padelooId = getPadelooClubId(club);
  return padelooId != null ? String(padelooId) : null;
}

export function clubHasBookingIntegration(club: ClubIntegrationRef | undefined): boolean {
  if (!club?.integrationType) return false;
  if (isBooktimeClub(club)) return getBooktimeCompanyId(club) !== null;
  if (isPadelooClub(club)) return getPadelooClubId(club) !== null;
  if (isKlikterenClub(club)) return getKlikterenVenueId(club) !== null;
  return false;
}

export function courtHasActiveBookingIntegration(
  club: ClubIntegrationRef | undefined,
  court: CourtIntegrationRef | undefined,
): boolean {
  if (!clubHasBookingIntegration(club)) return false;
  if (!court) return false;
  return Boolean(court.externalCourtId?.trim());
}

export function shouldUseBooktimeCompanyDurations(
  club: ClubIntegrationRef | undefined,
  selectedCourtId: string | null | undefined,
  courts: CourtIntegrationRef[] | undefined,
): boolean {
  if (!isBooktimeClub(club) || !clubHasBookingIntegration(club)) return false;
  if (selectedCourtId === 'notBooked') return false;
  if (selectedCourtId) {
    const court = courts?.find((c) => c.id === selectedCourtId);
    return courtHasActiveBookingIntegration(club, court);
  }
  return true;
}

export function shouldUsePadelooDurations(
  club: ClubIntegrationRef | undefined,
  selectedCourtId: string | null | undefined,
  courts: CourtIntegrationRef[] | undefined,
): boolean {
  if (!isPadelooClub(club) || !clubHasBookingIntegration(club)) return false;
  if (selectedCourtId === 'notBooked') return false;
  if (selectedCourtId) {
    const court = courts?.find((c) => c.id === selectedCourtId);
    return courtHasActiveBookingIntegration(club, court);
  }
  return true;
}

export function shouldUseKlikterenDurations(
  club: ClubIntegrationRef | undefined,
  selectedCourtId: string | null | undefined,
  courts: CourtIntegrationRef[] | undefined,
): boolean {
  if (!isKlikterenClub(club) || !clubHasBookingIntegration(club)) return false;
  if (selectedCourtId === 'notBooked') return false;
  if (selectedCourtId) {
    const court = courts?.find((c) => c.id === selectedCourtId);
    return courtHasActiveBookingIntegration(club, court);
  }
  return true;
}
