import { create } from 'zustand';

const CHANNEL = 'reaction-emoji-usage';

export type ReactionEmojiUsageMutationPayload = {
  version: number;
  touched: { emoji: string; count: number; lastUsedAt: string } | null;
};

export type ReactionUsageItem = { emoji: string; count: number; lastUsedAt: string | null };

type Status = 'idle' | 'loading' | 'ready' | 'error';

type State = {
  version: number;
  byEmoji: Record<string, ReactionUsageItem>;
  status: Status;
  lastFetchedAt: number;
  lastError: string | null;
  hydrate: (snapshot: { version: number; items: ReactionUsageItem[] }) => void;
  applyFromMutation: (payload: ReactionEmojiUsageMutationPayload) => void;
  reset: () => void;
  selectTopFrequent: (n: number) => string[];
};

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      return null;
    }
  }
  return channel;
}

function sortUsageItems(items: ReactionUsageItem[]): ReactionUsageItem[] {
  return [...items].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const ta = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const tb = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return a.emoji.localeCompare(b.emoji);
  });
}

const initial: Pick<State, 'version' | 'byEmoji' | 'status' | 'lastFetchedAt' | 'lastError'> = {
  version: 0,
  byEmoji: {},
  status: 'idle',
  lastFetchedAt: 0,
  lastError: null,
};

export const useReactionEmojiUsageStore = create<State>((set, get) => ({
  ...initial,
  hydrate: (snapshot) => {
    const byEmoji: Record<string, ReactionUsageItem> = {};
    for (const it of snapshot.items) {
      byEmoji[it.emoji] = it;
    }
    set({
      version: snapshot.version,
      byEmoji,
      status: 'ready',
      lastFetchedAt: Date.now(),
      lastError: null,
    });
  },
  applyFromMutation: (payload) => {
    set((s) => {
      if (payload.version < s.version) return s;
      if (!payload.touched && payload.version === s.version) return s;
      const nextBy = { ...s.byEmoji };
      if (payload.touched) {
        nextBy[payload.touched.emoji] = {
          emoji: payload.touched.emoji,
          count: payload.touched.count,
          lastUsedAt: payload.touched.lastUsedAt,
        };
      }
      const ch = getChannel();
      ch?.postMessage({ version: payload.version });
      return {
        ...s,
        version: payload.version,
        byEmoji: nextBy,
      };
    });
  },
  reset: () => set({ ...initial }),
  selectTopFrequent: (n) => {
    const items = Object.values(get().byEmoji);
    if (items.length === 0) return [];
    return sortUsageItems(items)
      .slice(0, n)
      .map((x) => x.emoji);
  },
}));

export function postReactionEmojiUsageBroadcast(version: number): void {
  getChannel()?.postMessage({ version });
}

export function subscribeReactionEmojiUsageBroadcast(onNewer: (version: number) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const onMsg = (ev: MessageEvent<{ version?: number }>) => {
    const v = ev.data?.version;
    if (typeof v === 'number') onNewer(v);
  };
  ch.addEventListener('message', onMsg);
  return () => ch.removeEventListener('message', onMsg);
}
