import { ClubIntegrationType } from '@prisma/client';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import { ApiError } from '../utils/ApiError';

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

export function assertBooktimeIntegrationConfig(
  integrationType: ClubIntegrationType | null | undefined,
  integrationConfig: unknown
): BooktimeIntegrationConfig | null {
  if (!integrationType) return null;
  if (integrationType !== ClubIntegrationType.BOOKTIME) {
    throw new ApiError(400, 'Unsupported integration type');
  }
  const config = parseBooktimeIntegrationConfig(integrationConfig);
  if (!config) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.companyIdRequired);
  }
  return config;
}

export function assertPadelooIntegrationConfig(
  integrationType: ClubIntegrationType | null | undefined,
  integrationConfig: unknown
): PadelooIntegrationConfig | null {
  if (!integrationType) return null;
  if (integrationType !== ClubIntegrationType.PADELOO) {
    throw new ApiError(400, 'Unsupported integration type');
  }
  const config = parsePadelooIntegrationConfig(integrationConfig);
  if (!config) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.padelooClubIdRequired);
  }
  return config;
}

export function assertKlikterenIntegrationConfig(
  integrationType: ClubIntegrationType | null | undefined,
  integrationConfig: unknown
): KlikterenIntegrationConfig | null {
  if (!integrationType) return null;
  if (integrationType !== ClubIntegrationType.KLIKTEREN) {
    throw new ApiError(400, 'Unsupported integration type');
  }
  const config = parseKlikterenIntegrationConfig(integrationConfig);
  if (!config) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.klikterenVenueIdRequired);
  }
  return config;
}

export function buildIntegrationConfigPayload(
  integrationType: ClubIntegrationType | null,
  integrationConfig: unknown
): {
  integrationType: ClubIntegrationType | null;
  integrationConfig: BooktimeIntegrationConfig | PadelooIntegrationConfig | KlikterenIntegrationConfig | null;
} {
  if (!integrationType) {
    return { integrationType: null, integrationConfig: null };
  }
  if (integrationType === ClubIntegrationType.BOOKTIME) {
    const config = assertBooktimeIntegrationConfig(integrationType, integrationConfig);
    return { integrationType, integrationConfig: config };
  }
  if (integrationType === ClubIntegrationType.PADELOO) {
    const config = assertPadelooIntegrationConfig(integrationType, integrationConfig);
    return { integrationType, integrationConfig: config };
  }
  if (integrationType === ClubIntegrationType.KLIKTEREN) {
    const config = assertKlikterenIntegrationConfig(integrationType, integrationConfig);
    return { integrationType, integrationConfig: config };
  }
  throw new ApiError(400, 'Unsupported integration type');
}
