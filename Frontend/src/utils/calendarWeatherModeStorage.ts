export type CalendarWeatherModeScope = 'my' | 'find';

const LEGACY_STORAGE_KEY = 'padelpulse-calendar-weather-mode';
const STORAGE_KEYS: Record<CalendarWeatherModeScope, string> = {
  my: `${LEGACY_STORAGE_KEY}-my`,
  find: `${LEGACY_STORAGE_KEY}-find`,
};

function parseStoredMode(value: string | null): boolean | null {
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
}

export function readCalendarWeatherMode(scope: CalendarWeatherModeScope): boolean {
  try {
    const scopedMode = parseStoredMode(localStorage.getItem(STORAGE_KEYS[scope]));
    if (scopedMode !== null) return scopedMode;

    const legacyMode = parseStoredMode(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacyMode === null) return false;

    localStorage.setItem(STORAGE_KEYS[scope], legacyMode ? '1' : '0');
    return legacyMode;
  } catch {
    return false;
  }
}

export function writeCalendarWeatherMode(scope: CalendarWeatherModeScope, enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS[scope], enabled ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
}
