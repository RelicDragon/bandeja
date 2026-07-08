const STORAGE_KEY = 'booktimeManualClubBooking.v1';

function readStoredPreferences(): Record<string, true> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, true] => {
        const [clubId, value] = entry;
        return typeof clubId === 'string' && clubId.length > 0 && value === true;
      }),
    );
  } catch {
    return {};
  }
}

function writeStoredPreferences(preferences: Record<string, true>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* Ignore storage failures; the current in-memory choice still applies. */
  }
}

export function getManualClubBookingPreference(clubId: string | undefined): boolean {
  if (!clubId) return false;
  return readStoredPreferences()[clubId] === true;
}

export function setManualClubBookingPreference(
  clubId: string | undefined,
  enabled: boolean,
): void {
  if (!clubId) return;
  const next = readStoredPreferences();
  if (enabled) {
    next[clubId] = true;
  } else {
    delete next[clubId];
  }
  writeStoredPreferences(next);
}
