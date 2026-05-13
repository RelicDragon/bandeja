import { get, set } from 'idb-keyval';

const IDB_KEY = 'padelpulse-your-leagues-home-expanded';
const LS_KEY = 'padelpulse-your-leagues-home-expanded';

export function readYourLeaguesHomeExpandedSync(): boolean {
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

export async function hydrateYourLeaguesHomeExpandedFromIdb(): Promise<boolean> {
  const v = await get<boolean>(IDB_KEY);
  if (typeof v !== 'boolean') return readYourLeaguesHomeExpandedSync();
  try {
    localStorage.setItem(LS_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
  return v;
}

export function persistYourLeaguesHomeExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(LS_KEY, expanded ? '1' : '0');
  } catch {
    /* ignore */
  }
  void set(IDB_KEY, expanded);
}
