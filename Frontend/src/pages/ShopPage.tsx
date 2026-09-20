import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';
import { EmptyStateCard } from '@/components/home/EmptyStateCard';
import { Button } from '@/components/Button';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { queryKeys } from '@/queries/queryKeys';
import { shopApi, type GoodsKind, type ShopItem } from '@/api/shop';
import { isShopEnabled } from '@/config/featureFlags';
import { useAuthStore } from '@/store/authStore';
import { useEquippedGoodsStore } from '@/store/equippedGoodsStore';
import { ShopBalancePill } from '@/components/shop/ShopBalancePill';
import { ShopItemCard } from '@/components/shop/ShopItemCard';
import { ShopItemSheet } from '@/components/shop/ShopItemSheet';
import { SHOP_KIND_ORDER, kindLabelKey } from '@/features/collection/collectionAssets';
import { sortShopItems } from '@/components/shop/shopFormat';
import '@/styles/collection.css';

/**
 * PRD 355 — the cosmetics shop (`/shop`, place `shop`), hosted by `MainPage`.
 *
 * Mobile first: the grid is two columns from 375 px up, the balance pill is
 * pinned to the inline-end of the header, and the featured rail scrolls
 * horizontally with snap points. With `VITE_SHOP_ENABLED` off the page renders
 * nothing and issues no request.
 */
type CategoryFilter = 'all' | GoodsKind;

export const ShopPage = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const viewerId = useAuthStore((state) => state.user?.id);
  const applyOwnEquipped = useEquippedGoodsStore((state) => state.applyOwn);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [openItem, setOpenItem] = useState<ShopItem | null>(null);
  const enabled = isShopEnabled();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.shop.catalog(category),
    queryFn: () => shopApi.getCatalog(category === 'all' ? undefined : category),
    enabled,
    staleTime: 30_000,
  });

  const items = useMemo(() => sortShopItems(data?.items ?? []), [data?.items]);
  const featured = useMemo(() => data?.featured ?? [], [data?.featured]);
  const balance = data?.balance ?? 0;

  // Keep the open sheet in step with a refetch (buy → Owned → Equip).
  const liveOpenItem = useMemo(
    () => (openItem ? (items.find((entry) => entry.id === openItem.id) ?? openItem) : null),
    [items, openItem],
  );

  if (!enabled) return null;

  const categoryOptions = [
    { id: 'all', label: t('shop.categoryAll') },
    ...SHOP_KIND_ORDER.map((kind) => ({ id: kind, label: t(kindLabelKey(kind)) })),
  ];

  const handleChanged = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.shop.all });
    const fresh = await refetch();
    if (viewerId) {
      // The viewer's own frame / name colour may have changed.
      const collection = await shopApi.getCollection().catch(() => null);
      if (collection) applyOwnEquipped(viewerId, collection.equipped);
    }
    return fresh;
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('shop.title')}</h1>
        <ShopBalancePill balance={balance} />
      </header>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className={`${shimmerBlock} h-56 rounded-2xl`} />
          ))}
        </div>
      ) : isError ? (
        <EmptyStateCard
          icon={ShoppingBag}
          title={t('shop.errorTitle')}
          description={t('shop.errorDescription')}
          action={
            <Button onClick={() => void refetch()} className="min-h-[44px]">
              {t('common.retry')}
            </Button>
          }
        />
      ) : items.length === 0 && category === 'all' ? (
        <EmptyStateCard
          icon={ShoppingBag}
          title={t('shop.emptyTitle')}
          description={t('shop.emptyDescription')}
        />
      ) : (
        <>
          <AnimatedMount layout show={featured.length > 0}>
            <section aria-labelledby="shop-featured-heading" className="mb-5">
              <h2
                id="shop-featured-heading"
                className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
              >
                {t('shop.featured')}
              </h2>
              <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1">
                {featured.map((item) => (
                  <div key={item.id} className="snap-start">
                    <ShopItemCard item={item} variant="featured" onOpen={setOpenItem} />
                  </div>
                ))}
              </div>
            </section>
          </AnimatedMount>

          <div className="mb-3">
            <SegmentedSwitch
              layoutId="shop-category-chips"
              tabs={categoryOptions}
              activeId={category}
              onChange={(next) => setCategory(next as CategoryFilter)}
              showOnlyActiveTabText={false}
              size="sm"
              ariaLabel={t('shop.categoryAria')}
            />
          </div>

          {items.length === 0 ? (
            // The chips stay mounted above: an empty category must never remove
            // the only control that gets the shopper back to "All".
            <EmptyStateCard
              icon={ShoppingBag}
              title={t('shop.emptyCategoryTitle')}
              description={t('shop.emptyCategoryDescription')}
              action={
                <Button onClick={() => setCategory('all')} className="min-h-[44px]">
                  {t('shop.showAll')}
                </Button>
              }
            />
          ) : (
            <section aria-label={t('shop.catalogAria')} className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <ShopItemCard key={item.id} item={item} onOpen={setOpenItem} />
              ))}
            </section>
          )}
        </>
      )}

      <ShopItemSheet
        item={liveOpenItem}
        balance={balance}
        onClose={() => setOpenItem(null)}
        onChanged={() => void handleChanged()}
      />
    </div>
  );
};
