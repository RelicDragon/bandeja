import { create } from 'zustand';

const STORAGE_KEY = 'bandeja.browseCity';
const MAX_RECENTS = 3;

export type BrowseCitySnapshot = {
  name: string;
  country: string;
};

type PersistedBrowseCity = {
  cityId: string | null;
  recents: string[];
  snapshots: Record<string, BrowseCitySnapshot>;
};

function readPersisted(): PersistedBrowseCity {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { cityId: null, recents: [], snapshots: {} };
    const parsed = JSON.parse(raw) as PersistedBrowseCity;
    return {
      cityId: typeof parsed.cityId === 'string' ? parsed.cityId : null,
      recents: Array.isArray(parsed.recents)
        ? parsed.recents.filter((id): id is string => typeof id === 'string').slice(0, MAX_RECENTS)
        : [],
      snapshots:
        parsed.snapshots && typeof parsed.snapshots === 'object' ? parsed.snapshots : {},
    };
  } catch {
    return { cityId: null, recents: [], snapshots: {} };
  }
}

function writePersisted(state: PersistedBrowseCity): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota */
  }
}

type BrowseCityState = PersistedBrowseCity & {
  setCityId: (cityId: string, snapshot?: BrowseCitySnapshot, homeCityId?: string | null) => void;
  rememberSnapshot: (cityId: string, snapshot: BrowseCitySnapshot) => void;
  resetToHome: (opts?: { clearRecents?: boolean }) => void;
};

const initial = readPersisted();

export const useBrowseCityStore = create<BrowseCityState>((set, get) => ({
  cityId: initial.cityId,
  recents: initial.recents,
  snapshots: initial.snapshots,

  setCityId: (cityId, snapshot, homeCityId) => {
    const prev = get();
    const isHome = Boolean(homeCityId && cityId === homeCityId);
    const snapshots = snapshot
      ? { ...prev.snapshots, [cityId]: snapshot }
      : prev.snapshots;
    const recents = isHome
      ? prev.recents.filter((id) => id !== cityId)
      : [cityId, ...prev.recents.filter((id) => id !== cityId && id !== homeCityId)].slice(0, MAX_RECENTS);
    const next = { cityId: isHome ? null : cityId, recents, snapshots };
    writePersisted(next);
    set(next);
  },

  rememberSnapshot: (cityId, snapshot) => {
    const prev = get();
    const snapshots = { ...prev.snapshots, [cityId]: snapshot };
    writePersisted({ cityId: prev.cityId, recents: prev.recents, snapshots });
    set({ snapshots });
  },

  resetToHome: (opts) => {
    const prev = get();
    const next = {
      cityId: null,
      recents: opts?.clearRecents ? [] : prev.recents,
      snapshots: prev.snapshots,
    };
    writePersisted(next);
    set({ cityId: null, recents: next.recents });
  },
}));
