import { Sport } from '@prisma/client';

export type BooktimeResourceService = {
  uuid?: string;
  name?: string;
  isBookable?: boolean;
};

export type BooktimeResourceGroup = {
  name?: string;
};

export type BooktimeResourceForSport = {
  name?: string;
  group?: BooktimeResourceGroup | null;
  services?: BooktimeResourceService[];
};

const PADEL_KEYWORDS = ['padel'];
const TENNIS_KEYWORDS = ['tenis', 'tennis'];

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function bookableServices(resource: BooktimeResourceForSport): BooktimeResourceService[] {
  return (resource.services ?? []).filter(
    (service) =>
      service.isBookable !== false &&
      typeof service.uuid === 'string' &&
      service.uuid.trim().length > 0,
  );
}

function serviceMatchesKeywords(serviceName: string, keywords: string[]): boolean {
  const normalized = normalizeLabel(serviceName);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function resourceHasPadelService(resource: BooktimeResourceForSport): boolean {
  return bookableServices(resource).some(
    (service) => typeof service.name === 'string' && serviceMatchesKeywords(service.name, PADEL_KEYWORDS),
  );
}

function resourceHasTennisService(resource: BooktimeResourceForSport): boolean {
  return bookableServices(resource).some(
    (service) => typeof service.name === 'string' && serviceMatchesKeywords(service.name, TENNIS_KEYWORDS),
  );
}

export function inferCourtSportFromBooktimeResource(
  resource: BooktimeResourceForSport,
  fallbackSport: Sport = Sport.PADEL,
): Sport | null {
  const groupName = normalizeLabel(resource.group?.name ?? '');
  const hasPadel = resourceHasPadelService(resource);
  const hasTennis = resourceHasTennisService(resource);

  if (groupName === 'tenis') {
    return Sport.TENNIS;
  }

  if (groupName === 'padel') {
    return Sport.PADEL;
  }

  if (hasTennis && !hasPadel) return Sport.TENNIS;
  if (hasPadel && !hasTennis) return Sport.PADEL;
  if (hasPadel && hasTennis) return null;

  return fallbackSport;
}

export function tennisCourtDisplayName(resourceName: string): string {
  const trimmed = resourceName.trim();
  const match = trimmed.match(/(\d+)/);
  if (match) return `Tennis Court ${match[1]}`;
  return `${trimmed} (Tenis)`;
}

export function courtNamesConflictForSport(
  existingSport: Sport | null,
  inferredSport: Sport | null,
): boolean {
  if (existingSport == null || inferredSport == null) return false;
  return existingSport !== inferredSport;
}
