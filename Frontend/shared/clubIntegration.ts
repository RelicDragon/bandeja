/** Keep in sync with Backend/src/shared/clubIntegration.ts */

export type ClubIntegrationType = 'BOOKTIME';

export interface BooktimeIntegrationConfig {
  companyId: string;
  termsUrl?: string;
  privacyUrl?: string;
  serviceIds?: string[];
}

export type ClubIntegrationRef = {
  integrationType?: ClubIntegrationType | null;
  integrationConfig?: unknown;
};

export type CourtIntegrationRef = {
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

/** Club uses Booktime integration (may lack companyId — club-level UI still needs companyId separately). */
export function isBooktimeClub(club: ClubIntegrationRef | undefined): boolean {
  return club?.integrationType === 'BOOKTIME';
}

/** Booktime company id when club integration config is valid; null otherwise. */
export function getBooktimeCompanyId(club: ClubIntegrationRef | undefined): string | null {
  if (!isBooktimeClub(club)) return null;
  return parseBooktimeIntegrationConfig(club?.integrationConfig)?.companyId ?? null;
}

/** Club-level: integrated club with companyId — drives tabs / segmented UI mode. */
export function clubHasBookingIntegration(club: ClubIntegrationRef | undefined): boolean {
  return getBooktimeCompanyId(club) !== null;
}

/** Court-level: integrated club + mapped externalCourtId — drives book-on-create per court. */
export function courtHasActiveBookingIntegration(
  club: ClubIntegrationRef | undefined,
  court: CourtIntegrationRef | undefined,
): boolean {
  if (!clubHasBookingIntegration(club)) return false;
  if (!court) return false;
  return Boolean(court.externalCourtId?.trim());
}
