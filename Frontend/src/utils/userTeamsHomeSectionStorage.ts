import { get, set } from 'idb-keyval';

const IDB_KEY = 'padelpulse-user-teams-home-expanded';
const LS_KEY = 'padelpulse-user-teams-home-expanded';

export function readUserTeamsHomeExpandedSync(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s === '0') return false;
    if (s === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export async function hydrateUserTeamsHomeExpandedFromIdb(): Promise<boolean> {
  const v = await get<boolean>(IDB_KEY);
  if (typeof v !== 'boolean') return readUserTeamsHomeExpandedSync();
  try {
    localStorage.setItem(LS_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
  return v;
}

export function persistUserTeamsHomeExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(LS_KEY, expanded ? '1' : '0');
  } catch {
    /* ignore */
  }
  void set(IDB_KEY, expanded);
}
