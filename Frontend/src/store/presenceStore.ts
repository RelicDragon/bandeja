import { create } from 'zustand';

const MAX_PRESENCE_KEYS = 3500;

function pruneToMax(next: Record<string, boolean>, max: number): Record<string, boolean> {
  const keys = Object.keys(next);
  if (keys.length <= max) return next;
  const toKeep = keys.slice(-max);
  const out: Record<string, boolean> = {};
  toKeep.forEach((k) => { out[k] = next[k]; });
  return out;
}

interface PresenceState {
  online: Record<string, boolean>;
  setPresenceInitial: (initial: Record<string, boolean>) => void;
  setPresenceBatch: (online: string[], offline: string[]) => void;
  isOnline: (userId: string) => boolean;
  isOffline: (userId: string) => boolean;
  isUnknown: (userId: string) => boolean;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  online: {},
  setPresenceInitial: (initial) => {
    if (!initial || typeof initial !== 'object') return;
    set((state) => {
      const next = { ...state.online };
      Object.entries(initial).forEach(([id, v]) => { if (typeof id === 'string' && (v === true || v === false)) next[id] = v; });
      return { online: pruneToMax(next, MAX_PRESENCE_KEYS) };
    });
  },
  setPresenceBatch: (onlineIds, offlineIds) => {
    const on = Array.isArray(onlineIds) ? onlineIds : [];
    const off = Array.isArray(offlineIds) ? offlineIds : [];
    set((state) => {
      const next = { ...state.online };
      on.forEach((id) => { if (typeof id === 'string') next[id] = true; });
      off.forEach((id) => { if (typeof id === 'string') next[id] = false; });
      return { online: pruneToMax(next, MAX_PRESENCE_KEYS) };
    });
  },
  isOnline: (userId) => get().online[userId] === true,
  isOffline: (userId) => get().online[userId] === false,
  isUnknown: (userId) => !(userId in get().online),
}));
