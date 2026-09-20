import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, Sparkles } from 'lucide-react';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { queryKeys } from '@/queries/queryKeys';
import { shopApi, type ShopItem } from '@/api/shop';
import { isShopEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { useEquippedGoodsStore } from '@/store/equippedGoodsStore';
import { ShopItemPreview } from './ShopItemPreview';
import { isEquippableKind } from './shopFormat';
import { markGiftsCelebrated, pendingGiftCelebrations } from './collectionGiftSeen';
import '@/styles/collection.css';

/**
 * PRD 355 — Profile → Appearance → **Collection**.
 *
 * Owned items as small tiles; tapping one equips it (and unequips whatever else
 * of that kind was on), so a frame appears on the profile avatar immediately.
 * With the shop flag off the section renders nothing and fetches nothing.
 */
export const CollectionSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const viewerId = useAuthStore((state) => state.user?.id);
  const applyOwnEquipped = useEquippedGoodsStore((state) => state.applyOwn);
  const [busyId, setBusyId] = useState<string | null>(null);
  const enabled = isShopEnabled();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.shop.collection,
    queryFn: () => shopApi.getCollection(),
    enabled,
    staleTime: 30_000,
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const giftedIds = useMemo(
    () => items.filter((item) => item.giftedByUserId).map((item) => item.id),
    [items],
  );
  const [sparkleIds, setSparkleIds] = useState<string[]>([]);

  useEffect(() => {
    if (giftedIds.length === 0) return;
    const pending = pendingGiftCelebrations(giftedIds);
    if (pending.length === 0) return;
    setSparkleIds(pending);
    markGiftsCelebrated(pending);
  }, [giftedIds]);

  useEffect(() => {
    if (viewerId && data?.equipped) applyOwnEquipped(viewerId, data.equipped);
  }, [viewerId, data?.equipped, applyOwnEquipped]);

  if (!enabled) return null;

  const toggle = async (item: ShopItem) => {
    setBusyId(item.id);
    try {
      const equipped = item.equipped ? await shopApi.unequip(item.id) : await shopApi.equip(item.id);
      if (viewerId) applyOwnEquipped(viewerId, equipped);
      await queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
    } catch {
      toast.error(t('shop.errorGeneric'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('shop.collection')}
        </label>
        <button
          type="button"
          onClick={() => navigate('/shop')}
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary-600 dark:text-primary-400"
        >
          {t('shop.getMoreStyles')}
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className={`${shimmerBlock} h-24 rounded-xl`} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('shop.collectionEmpty')}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {items.map((item) => {
            // Sticker packs are unlocked by ownership — nothing to equip, so the
            // tile states that instead of being a tappable no-op.
            const equippable = isEquippableKind(item.kind);
            const tileClass = `relative flex min-h-[44px] w-full flex-col items-center gap-1 rounded-xl border p-2 transition-colors ${
              item.equipped
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
            } ${sparkleIds.includes(item.id) ? 'shop-sparkle' : ''}`;
            const tileBody = (
              <>
                <ShopItemPreview
                  item={item}
                  context={item.kind === 'CHAT_ACCENT' ? 'chat' : 'profile'}
                  size="md"
                />
                <span className="w-full truncate text-center text-[11px] text-gray-600 dark:text-gray-300">
                  {item.name}
                </span>
                {item.equipped ? (
                  <span className="absolute end-1 top-1 rounded-full bg-primary-600 p-0.5 text-white">
                    <Check size={12} aria-hidden="true" />
                  </span>
                ) : null}
                {sparkleIds.includes(item.id) ? (
                  <span className="absolute start-1 top-1 text-amber-400">
                    <Sparkles size={12} aria-hidden="true" />
                    <span className="sr-only">{t('shop.giftBadge')}</span>
                  </span>
                ) : null}
              </>
            );
            return (
              <li key={item.id}>
                {equippable ? (
                  <button
                    type="button"
                    onClick={() => void toggle(item)}
                    disabled={busyId === item.id}
                    aria-pressed={item.equipped}
                    aria-label={`${item.name}. ${item.equipped ? t('shop.equipped') : t('shop.tapToEquip')}`}
                    className={tileClass}
                  >
                    {tileBody}
                  </button>
                ) : (
                  <div data-testid="collection-unlocked-tile" className={tileClass}>
                    {tileBody}
                    {/* A bare `aria-label` on a div is not announced; say it in text. */}
                    <span className="sr-only">{t('shop.stickerPackUnlocked')}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
