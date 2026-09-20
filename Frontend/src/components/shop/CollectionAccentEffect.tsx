import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/queries/queryKeys';
import { shopApi } from '@/api/shop';
import { isShopEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { useEquippedGoodsStore } from '@/store/equippedGoodsStore';
import { COLLECTION_ACCENT_KEYS } from '@/features/collection/collectionAssets';
import '@/styles/collection.css';

/**
 * PRD 355 — applies the signed-in player's own cosmetics app-wide.
 *
 * The chat accent is **viewer-local**: it tints the viewer's own outgoing
 * bubbles and nobody else's, so it is applied as a single class on `<body>`
 * rather than travelling in any payload. Renders nothing.
 */
export const CollectionAccentEffect = () => {
  const viewerId = useAuthStore((state) => state.user?.id);
  const applyOwn = useEquippedGoodsStore((state) => state.applyOwn);
  const enabled = isShopEnabled() && Boolean(viewerId);

  const { data } = useQuery({
    queryKey: queryKeys.shop.collection,
    queryFn: () => shopApi.getCollection(),
    enabled,
    staleTime: 5 * 60_000,
  });

  const accentKey = data?.equipped.chatAccent?.assetKey ?? null;

  useEffect(() => {
    if (viewerId && data?.equipped) applyOwn(viewerId, data.equipped);
  }, [viewerId, data?.equipped, applyOwn]);

  useEffect(() => {
    const body = document.body;
    for (const key of COLLECTION_ACCENT_KEYS) body.classList.remove(`collection-${key}`);
    if (accentKey && (COLLECTION_ACCENT_KEYS as readonly string[]).includes(accentKey)) {
      body.classList.add(`collection-${accentKey}`);
    }
    return () => {
      for (const key of COLLECTION_ACCENT_KEYS) body.classList.remove(`collection-${key}`);
    };
  }, [accentKey]);

  return null;
};
