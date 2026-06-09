export type ChatNearBottomStore = {
  get: () => boolean;
  set: (near: boolean) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createChatNearBottomStore(initial = true): ChatNearBottomStore {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set: (near) => {
      if (value === near) return;
      value = near;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
