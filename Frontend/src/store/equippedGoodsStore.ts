import { create } from 'zustand';
import { shopApi, type PublicEquippedGoods, type ViewerEquippedGoods } from '@/api/shop';
import { isShopEnabled } from '@/config/featureFlags';

/**
 * PRD 355 — who is wearing what.
 *
 * Avatars and name labels render in long lists, so asking per user would be a
 * request storm. Ids raised by components are collected for one animation frame
 * and resolved in a single batched call; the answer is cached for the session
 * and refreshed only when the viewer changes their own equipment.
 *
 * With the shop flag off nothing is requested and every lookup is empty, so the
 * feature degrades to plain avatars.
 */

const EMPTY: PublicEquippedGoods = { frame: null, nameColor: null };
const FLUSH_DELAY_MS = 40;
/** The batch endpoint caps ids per call; stay under it. */
const MAX_IDS_PER_CALL = 100;

export interface EquippedGoodsState {
  byUser: Record<string, PublicEquippedGoods>;
  /** Ids already requested (resolved or in flight) — never asked twice. */
  requested: Set<string>;
  /** Raise interest in these users; resolves on the next batch. */
  request: (userIds: (string | null | undefined)[]) => void;
  /** The viewer just changed their own equipment. */
  applyOwn: (userId: string, equipped: ViewerEquippedGoods) => void;
  /** Sign-out / account switch. */
  reset: () => void;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let queued: string[] = [];

export const useEquippedGoodsStore = create<EquippedGoodsState>((set, get) => ({
  byUser: {},
  requested: new Set<string>(),

  request: (userIds) => {
    if (!isShopEnabled()) return;
    const { requested } = get();
    const fresh = userIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0 && !requested.has(id),
    );
    if (fresh.length === 0) return;
    for (const id of fresh) requested.add(id);
    queued.push(...fresh);

    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const batch = queued.slice(0, MAX_IDS_PER_CALL);
      queued = queued.slice(MAX_IDS_PER_CALL);
      if (queued.length > 0) {
        // Whatever did not fit goes out on the next tick.
        flushTimer = setTimeout(() => {
          flushTimer = null;
          get().request(queued.splice(0, queued.length));
        }, FLUSH_DELAY_MS);
      }
      shopApi
        .getEquippedForUsers(batch)
        .then((data) => {
          set((state) => ({ byUser: { ...state.byUser, ...data } }));
        })
        .catch(() => {
          // A cosmetic lookup must never surface an error; allow a later retry.
          set((state) => {
            const next = new Set(state.requested);
            for (const id of batch) next.delete(id);
            return { requested: next };
          });
        });
    }, FLUSH_DELAY_MS);
  },

  applyOwn: (userId, equipped) => {
    set((state) => ({
      byUser: {
        ...state.byUser,
        [userId]: { frame: equipped.frame, nameColor: equipped.nameColor },
      },
      requested: new Set(state.requested).add(userId),
    }));
  },

  reset: () => {
    queued = [];
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    set({ byUser: {}, requested: new Set<string>() });
  },
}));

/** Read one user's public cosmetics without subscribing to the whole map. */
export function selectEquippedFor(userId: string | null | undefined) {
  return (state: EquippedGoodsState): PublicEquippedGoods =>
    (userId ? state.byUser[userId] : undefined) ?? EMPTY;
}
