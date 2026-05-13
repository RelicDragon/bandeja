import { get, set } from 'idb-keyval';

const IDB_KEY = 'padelpulse-your-leagues-home-hub-expanded';
const LS_KEY = 'padelpulse-your-leagues-home-hub-expanded';

export type HubExpandedMap = Record<string, boolean>;

function parse(raw: string | null): HubExpandedMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: HubExpandedMap = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'boolean') out[k] = v;
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function readYourLeaguesHomeHubExpandedSync(): HubExpandedMap {
  if (typeof window === 'undefined') return {};
  try {
    return parse(localStorage.getItem(LS_KEY));
  } catch {
    return {};
  }
}

export async function hydrateYourLeaguesHomeHubExpandedFromIdb(): Promise<HubExpandedMap> {
  const v = await get<HubExpandedMap>(IDB_KEY);
  if (!v || typeof v !== 'object') return readYourLeaguesHomeHubExpandedSync();
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
  return v;
}

export function persistYourLeaguesHomeHubExpanded(map: HubExpandedMap): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  void set(IDB_KEY, map);
}
