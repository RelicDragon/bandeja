import { useEffect, useMemo } from 'react';
import { selectEquippedFor, useEquippedGoodsStore } from '@/store/equippedGoodsStore';
import { frameClass, resolveNameClass } from './collectionAssets';

/**
 * PRD 355 — hooks that let any surface render somebody's equipped cosmetics.
 *
 * They are deliberately cheap: raising interest is idempotent and the lookup is
 * a single map read, so a 40-row leaderboard costs one batched request.
 */

/** The frame ring class for a user, or `null` when they wear none. */
export function useFrameClass(userId: string | null | undefined, size: 'md' | 'sm' = 'md'): string | null {
  const request = useEquippedGoodsStore((state) => state.request);
  const equipped = useEquippedGoodsStore(useMemo(() => selectEquippedFor(userId), [userId]));

  useEffect(() => {
    if (userId) request([userId]);
  }, [userId, request]);

  const base = frameClass(equipped.frame?.assetKey);
  if (!base) return null;
  return size === 'sm' ? `${base} collection-frame-sm` : base;
}

/**
 * The name-colour class for a user. Premium gold wins: when the viewer's target
 * shows premium status, the bought colour steps aside.
 */
export function useNameColorClass(
  userId: string | null | undefined,
  premiumVisible: boolean,
): string | null {
  const request = useEquippedGoodsStore((state) => state.request);
  const equipped = useEquippedGoodsStore(useMemo(() => selectEquippedFor(userId), [userId]));

  useEffect(() => {
    if (userId && !premiumVisible) request([userId]);
  }, [userId, premiumVisible, request]);

  return resolveNameClass({ premiumVisible, nameColorAssetKey: equipped.nameColor?.assetKey });
}

/** Pre-warm a whole list in one batch (roster rows, leaderboards). */
export function usePrefetchEquippedGoods(userIds: (string | null | undefined)[]): void {
  const request = useEquippedGoodsStore((state) => state.request);
  const key = userIds.filter(Boolean).join(',');

  useEffect(() => {
    if (key) request(key.split(','));
  }, [key, request]);
}
