export type MyGamesViewMode = 'calendar' | 'list';

const LEGACY_STORAGE_KEY = 'padelpulse-my-games-view';
const STORAGE_PREFIX = `${LEGACY_STORAGE_KEY}:`;

function storageKeyForUser(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function parseMode(value: string | null): MyGamesViewMode | null {
  if (value === 'list' || value === 'calendar') return value;
  return null;
}

/** Per-user My-tab calendar visibility. Legacy key migrates once, then is removed. */
export function readMyGamesViewMode(userId?: string | null): MyGamesViewMode {
  try {
    if (userId) {
      const scoped = parseMode(localStorage.getItem(storageKeyForUser(userId)));
      if (scoped) return scoped;

      const legacy = parseMode(localStorage.getItem(LEGACY_STORAGE_KEY));
      if (legacy) {
        localStorage.setItem(storageKeyForUser(userId), legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return legacy;
      }
      return 'calendar';
    }

    return parseMode(localStorage.getItem(LEGACY_STORAGE_KEY)) ?? 'calendar';
  } catch {
    return 'calendar';
  }
}

export function writeMyGamesViewMode(
  mode: MyGamesViewMode,
  userId?: string | null,
): void {
  try {
    if (userId) {
      localStorage.setItem(storageKeyForUser(userId), mode);
      return;
    }
    localStorage.setItem(LEGACY_STORAGE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}
