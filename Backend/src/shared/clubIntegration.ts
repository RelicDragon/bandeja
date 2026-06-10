import { ClubIntegrationType } from '@prisma/client';
import { ApiError } from '../utils/ApiError';

export interface BooktimeIntegrationConfig {
  companyId: string;
  termsUrl?: string;
  privacyUrl?: string;
  serviceIds?: string[];
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
    throw new ApiError(400, 'companyId is required for BookTime integration');
  }
  return config;
}

export function buildIntegrationConfigPayload(
  integrationType: ClubIntegrationType | null,
  integrationConfig: unknown
): { integrationType: ClubIntegrationType | null; integrationConfig: BooktimeIntegrationConfig | null } {
  if (!integrationType) {
    return { integrationType: null, integrationConfig: null };
  }
  const config = assertBooktimeIntegrationConfig(integrationType, integrationConfig);
  return { integrationType, integrationConfig: config };
}
