import type { BooktimeCompany } from './client';

export const DEFAULT_GAME_DURATIONS_HOURS = [1, 1.5, 2] as const;
export const DEFAULT_TOURNAMENT_DURATIONS_HOURS = [1, 1.5, 2, 3, 4, 6] as const;
export const BOOKTIME_FALLBACK_DURATIONS_MINUTES = [60, 120] as const;

export function minutesToDurationHours(minutes: number): number {
  return minutes / 60;
}

export function resolveBooktimeDurationsMinutes(company?: BooktimeCompany | null): number[] {
  const fromApi = company?.bookingDurations?.filter((m) => Number.isFinite(m) && m > 0);
  if (fromApi && fromApi.length > 0) {
    return [...new Set(fromApi)].sort((a, b) => a - b);
  }
  return [...BOOKTIME_FALLBACK_DURATIONS_MINUTES];
}

export function resolveBooktimeDurationsHours(company?: BooktimeCompany | null): number[] {
  return resolveBooktimeDurationsMinutes(company).map(minutesToDurationHours);
}

export function pickClosestDurationOption(current: number, options: number[]): number {
  if (options.length === 0) return current;
  if (options.includes(current)) return current;
  const sorted = [...options].sort((a, b) => a - b);
  const lowerOrEqual = sorted.filter((d) => d <= current);
  return lowerOrEqual.length > 0 ? lowerOrEqual[lowerOrEqual.length - 1]! : sorted[0]!;
}
