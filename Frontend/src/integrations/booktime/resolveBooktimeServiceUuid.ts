import type { Sport } from '@shared/sport';
import { DEFAULT_SPORT, parseSport } from '@shared/sport';
import type { Club } from '@/types';
import type { BooktimeCompany, BooktimeCompanyResource } from './client';

type BookableService = {
  uuid: string;
  name: string;
};

const SPORT_SERVICE_KEYWORDS: Partial<Record<Sport, string[]>> = {
  PADEL: ['padel'],
  TENNIS: ['tenis', 'tennis'],
  PICKLEBALL: ['pickleball'],
  BADMINTON: ['badminton'],
  TABLE_TENNIS: ['table tennis', 'stolni tenis', 'ping pong'],
  SQUASH: ['squash'],
};

function resourceExternalId(resource: BooktimeCompanyResource): string | null {
  const id = resource.bookingResourceId ?? resource.uuid;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function parseConfigServiceIds(integrationConfig?: Club['integrationConfig']): string[] {
  if (!integrationConfig || typeof integrationConfig !== 'object' || Array.isArray(integrationConfig)) {
    return [];
  }
  const serviceIds = (integrationConfig as Record<string, unknown>).serviceIds;
  if (!Array.isArray(serviceIds)) return [];
  return serviceIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

function getBookableServices(resource: BooktimeCompanyResource): BookableService[] {
  const fromServices = (resource.services ?? [])
    .filter(
      (service) =>
        service.isBookable !== false &&
        typeof service.uuid === 'string' &&
        service.uuid.trim().length > 0,
    )
    .map((service) => ({
      uuid: service.uuid!.trim(),
      name: typeof service.name === 'string' ? service.name.trim() : '',
    }));
  if (fromServices.length > 0) return fromServices;

  if (typeof resource.serviceUuid === 'string' && resource.serviceUuid.trim()) {
    return [{ uuid: resource.serviceUuid.trim(), name: '' }];
  }
  return [];
}

function matchesSportKeyword(serviceName: string, sport: Sport): boolean {
  const keywords = SPORT_SERVICE_KEYWORDS[sport];
  if (!keywords?.length) return false;
  const normalized = serviceName.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function pickServiceBySport(services: BookableService[], sport: Sport): string | null {
  const matches = services.filter((service) => matchesSportKeyword(service.name, sport));
  if (matches.length === 1) return matches[0]!.uuid;
  if (matches.length > 1) return matches[0]!.uuid;
  return null;
}

export function resolveBooktimeServiceUuid(
  company: BooktimeCompany,
  externalCourtId: string,
  integrationConfig?: Club['integrationConfig'],
  sportHint?: Sport | null,
): string {
  const sport = parseSport(sportHint ?? DEFAULT_SPORT);
  const configIds = parseConfigServiceIds(integrationConfig);

  let matchedResource: BooktimeCompanyResource | undefined;
  for (const resource of company.bookingResources ?? []) {
    if (resourceExternalId(resource) === externalCourtId) {
      matchedResource = resource;
      break;
    }
  }

  if (matchedResource) {
    if (typeof matchedResource.serviceUuid === 'string' && matchedResource.serviceUuid.trim()) {
      return matchedResource.serviceUuid.trim();
    }

    const bookable = getBookableServices(matchedResource);

    if (configIds.length === 1) return configIds[0]!;

    if (configIds.length > 1 && bookable.length > 0) {
      const configuredMatch = configIds.find((id) => bookable.some((service) => service.uuid === id));
      if (configuredMatch) return configuredMatch;
    }

    if (bookable.length === 1) return bookable[0]!.uuid;

    if (bookable.length > 1) {
      const bySport = pickServiceBySport(bookable, sport);
      if (bySport) return bySport;
    }
  }

  if (configIds.length === 1) return configIds[0]!;

  throw new Error('Online booking not configured for this court');
}
