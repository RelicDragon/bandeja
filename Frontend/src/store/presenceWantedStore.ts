import { create } from 'zustand';

const MAX_MERGED_IDS = 3000;
const AVATAR_IDS_CAP = 1000;

const isAvatarKey = (key: string) => key.startsWith('avatar:');

interface PresenceWantedState {
  wantedByKey: Record<string, string[]>;
  setWanted: (key: string, ids: string[]) => void;
  clearWanted: (key: string) => void;
  getMergedWantedIds: (excludeUserId?: string | null) => string[];
}

export const usePresenceWantedStore = create<PresenceWantedState>((set, get) => ({
  wantedByKey: {},
  setWanted: (key, ids) => {
    set((state) => ({
      wantedByKey: { ...state.wantedByKey, [key]: ids },
    }));
  },
  clearWanted: (key) => {
    set((state) => {
      const next = { ...state.wantedByKey };
      delete next[key];
      return { wantedByKey: next };
    });
  },
  getMergedWantedIds: (excludeUserId?: string | null) => {
    const { wantedByKey } = get();
    const listIds = new Set<string>();
    const avatarIds = new Set<string>();
    for (const [key, ids] of Object.entries(wantedByKey)) {
      const add = (target: Set<string>) => {
        (Array.isArray(ids) ? ids : []).forEach((id) => {
          if (typeof id === 'string' && id.length > 0 && id !== excludeUserId) target.add(id);
        });
      };
      if (isAvatarKey(key)) add(avatarIds);
      else add(listIds);
    }
    const result = new Set(listIds);
    let n = 0;
    for (const id of avatarIds) {
      if (n >= AVATAR_IDS_CAP) break;
      if (result.has(id)) continue;
      result.add(id);
      n++;
    }
    return Array.from(result).slice(0, MAX_MERGED_IDS);
  },
}));
