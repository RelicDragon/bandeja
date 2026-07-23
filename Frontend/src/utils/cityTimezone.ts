/** Matches Backend `DEFAULT_TIMEZONE` when city TZ is missing. */
export const APP_DEFAULT_TIMEZONE = 'Europe/Paris';

export function resolveViewerCityTimezone(timezone?: string | null): string {
  return timezone?.trim() || APP_DEFAULT_TIMEZONE;
}
