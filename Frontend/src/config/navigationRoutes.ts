// DEPRECATED: Navigation routes are no longer used.
// Back navigation is handled by utils/backNavigation.ts (handleBack).
// URL parsing is handled by utils/urlSchema.ts (parseLocation, buildUrl).
// This file is kept as a stub for compatibility — remove when safe.

export interface RouteConfig {
  pattern: RegExp;
  fallback: string;
  priority: number;
}

export const navigationRoutes: RouteConfig[] = [];

export const findMatchingRoute = (_pathname: string): RouteConfig | null => null;
