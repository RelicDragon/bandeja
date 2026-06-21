export type MyGamesViewMode = 'calendar' | 'list';

const STORAGE_KEY = 'padelpulse-my-games-view';

export function readMyGamesViewMode(): MyGamesViewMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'list' ? 'list' : 'calendar';
  } catch {
    return 'calendar';
  }
}

export function writeMyGamesViewMode(mode: MyGamesViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}
