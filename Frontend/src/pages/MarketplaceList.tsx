import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, PackageOpen, User } from 'lucide-react';
import { marketplaceApi, citiesApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useMarketItemUnread } from '@/hooks/useUnreadBridge';
import { MarketItem, MarketItemCategory, City, PriceCurrency } from '@/types';
import {
  AnimatedMarketItemGrid,
  MarketItemCard,
  MarketplaceFilters,
  MarketplaceLoadMore,
  MarketplaceLoadingSkeleton,
  MarketplaceRefreshingBar,
  formatPriceDisplay,
  MarketItemDrawer,
} from '@/components/marketplace';
import { AnimatedLoadingSwap } from '@/components/motion/AnimatedLoadingSwap';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { TabContentStack } from '@/components/motion/TabContentStack';
import { PullToRefreshShell } from '@/components/PullToRefreshShell';
import { PANEL_TRANSITION } from '@/components/motion/motionTokens';
import { EmptyStateCard } from '@/components/home/EmptyStateCard';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { currencyCacheService } from '@/services/currencyCache.service';
import { DEFAULT_CURRENCY } from '@/utils/currency';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { getMarketplaceCategorySport } from '@/utils/marketplaceSport';

const PAGE_SIZE = 20;

function MarketplaceListItemCard({
  item,
  formatPrice,
  tradeTypeLabel,
  showLocation,
  userCurrency,
  onItemClick,
}: {
  item: MarketItem;
  formatPrice: (item: MarketItem) => string;
  tradeTypeLabel: Record<string, string>;
  showLocation: boolean;
  userCurrency: PriceCurrency;
  onItemClick: (item: MarketItem) => void;
}) {
  const unreadCount = useMarketItemUnread(item);
  return (
    <MarketItemCard
      item={item}
      formatPrice={formatPrice}
      tradeTypeLabel={tradeTypeLabel}
      unreadCount={unreadCount > 0 ? unreadCount : undefined}
      showLocation={showLocation}
      userCurrency={userCurrency}
      onItemClick={onItemClick}
    />
  );
}

export const MarketplaceList = () => {
  const { t } = useTranslation();
  const { translateCity } = useTranslatedGeo();
  const reduceMotion = usePrefersReducedMotion();
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMyTab = location.pathname === '/marketplace/my';
  const [items, setItems] = useState<MarketItem[]>([]);
  const [categories, setCategories] = useState<MarketItemCategory[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);
  const cityId = (user?.currentCity?.id || user?.currentCityId) ?? '';
  const categorySport = getMarketplaceCategorySport(user);
  const [filters, setFilters] = useState({ categoryId: '' });
  const itemIdFromUrl = searchParams.get('item') ?? null;
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);
  useEffect(() => {
    if (isMyTab || categories.length > 0) return;
    setLoading(true);
    marketplaceApi.getCategories(categorySport).then((r) => {
      const list = r.data || [];
      setCategories(list);
      if (list.length > 0) setFilters((f) => ({ ...f, categoryId: list[0].id }));
    }).catch(() => {}).finally(() => setLoading(false));
    citiesApi.getAll().then((r) => setCities(r.data || [])).catch(() => {});
  }, [isMyTab, categories.length, categorySport]);

  const fetchData = useCallback(async (refresh = false) => {
    const page = refresh ? 1 : pageRef.current;
    setLoading(page === 1);
    setLoadingMore(page > 1);
    try {
      const [itemsRes, categoriesRes] = await Promise.all([
        marketplaceApi.getMarketItems({
          ...(isMyTab
            ? { sellerId: user?.id }
            : { cityId: cityId || undefined, categoryId: filters.categoryId || undefined }),
          page,
          limit: PAGE_SIZE,
        }),
        !isMyTab && page === 1 ? marketplaceApi.getCategories(categorySport) : Promise.resolve({ data: [] }),
      ]);
      const pagination = (itemsRes as { data?: MarketItem[]; pagination?: { hasMore: boolean } }).pagination;
      setHasMore(pagination?.hasMore ?? false);
      pageRef.current = page;
      if (page === 1) {
        setItems(itemsRes.data || []);
        const catData = (categoriesRes as { data?: MarketItemCategory[] }).data || [];
        if (catData.length > 0) setCategories(catData);
        const citiesRes = await citiesApi.getAll();
        setCities(citiesRes.data || []);
      } else {
        setItems((prev) => [...prev, ...(itemsRes.data || [])]);
      }
    } catch {
      if (page === 1) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cityId, filters.categoryId, isMyTab, user?.id, categorySport]);

  useEffect(() => {
    if (!isMyTab && filters.categoryId === '' && categories.length === 0) return;
    pageRef.current = 1;
    fetchData();

    const userCurrency = (user?.defaultCurrency as PriceCurrency) || DEFAULT_CURRENCY;
    currencyCacheService.prefetch(userCurrency).catch((err) => {
      console.warn('[MarketplaceList] Failed to prefetch currency rates:', err);
    });
  }, [fetchData, user?.defaultCurrency, isMyTab, filters.categoryId, categories.length]);

  useEffect(() => {
    if (!itemIdFromUrl) {
      setSelectedItem(null);
      return;
    }
    const inList = items.find((i) => i.id === itemIdFromUrl);
    if (inList) {
      setSelectedItem(inList);
      return;
    }
    if (selectedItem?.id === itemIdFromUrl) return;
    let cancelled = false;
    marketplaceApi.getMarketItemById(itemIdFromUrl).then((res) => {
      if (!cancelled) setSelectedItem(res.data);
    }).catch(() => {
      if (!cancelled) setSearchParams((p) => { const n = new URLSearchParams(p); n.delete('item'); return n; }, { replace: true });
    });
    return () => { cancelled = true; };
  }, [itemIdFromUrl, items, selectedItem?.id, setSearchParams]);

  const openDrawer = useCallback((item: MarketItem) => {
    setSelectedItem(item);
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.set('item', item.id);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const closeDrawer = useCallback(() => {
    setSelectedItem(null);
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('item');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleItemUpdate = useCallback((updated: MarketItem | null) => {
    if (!updated) {
      setItems((prev) => prev.filter((i) => i.id !== selectedItem?.id));
      setSelectedItem(null);
    } else {
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setSelectedItem((prev) => (prev?.id === updated.id ? updated : prev));
    }
  }, [selectedItem?.id]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    pageRef.current += 1;
    setLoadingMore(true);
    fetchData();
  }, [fetchData, loadingMore, hasMore]);

  const formatPrice = useCallback(
    (item: MarketItem) =>
      formatPriceDisplay(
        item,
        t('marketplace.suggestedPrice', { defaultValue: 'Haggling welcome' }),
        t('marketplace.free', { defaultValue: 'Free' })
      ),
    [t]
  );
  const tradeTypeLabels = {
    FREE: t('marketplace.sellingTypeFree', { defaultValue: 'Free' }),
    BUY_IT_NOW: t('marketplace.buyNow', { defaultValue: 'Buy now' }),
    SUGGESTED_PRICE: t('marketplace.suggestYourPrice', { defaultValue: 'Suggest your price' }),
    AUCTION: t('marketplace.sellingTypeAuction', { defaultValue: 'Auction' }),
  };

  const listContentKey = isMyTab ? 'my' : filters.categoryId || 'all';
  const initialLoading = loading && items.length === 0;
  const filterRefreshing = loading && items.length > 0;
  const tabMotionKey = isMyTab ? 'my' : 'market';

  const listBody = (
    <>
      <MarketplaceRefreshingBar show={filterRefreshing} />
      <AnimatedLoadingSwap
        isLoading={initialLoading}
        loading={<MarketplaceLoadingSkeleton />}
      >
        {items.length === 0 ? (
          <EmptyStateCard
            icon={PackageOpen}
            title={t('marketplace.noItems', { defaultValue: 'No listings found' })}
            description={
              isMyTab
                ? t('marketplace.myListingsEmpty', { defaultValue: 'List something to see it here.' })
                : t('marketplace.noItemsHint', { defaultValue: 'Try another category or check back later.' })
            }
          />
        ) : (
          <AnimatedMarketItemGrid
            key={listContentKey}
            items={items}
            getKey={(item) => item.id}
            dimmed={filterRefreshing}
            renderItem={(item) => (
              <MarketplaceListItemCard
                item={item}
                formatPrice={formatPrice}
                tradeTypeLabel={tradeTypeLabels}
                showLocation={isMyTab}
                userCurrency={(user?.defaultCurrency as PriceCurrency) || DEFAULT_CURRENCY}
                onItemClick={openDrawer}
              />
            )}
          />
        )}
      </AnimatedLoadingSwap>

      <AnimatedMount layout show={hasMore && items.length > 0} className="mt-6">
        <MarketplaceLoadMore loading={loadingMore} onClick={loadMore} />
      </AnimatedMount>
    </>
  );

  return (
    <PullToRefreshShell
      disabled={loading}
      onRefresh={async () => {
        pageRef.current = 1;
        await fetchData(true);
      }}
    >
      {() => (
        <div className="pb-8">
          <TabContentStack id="marketplace-tab-stack">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tabMotionKey}
                initial={reduceMotion ? false : { opacity: 0, x: isMyTab ? 16 : -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: isMyTab ? -16 : 16 }}
                transition={PANEL_TRANSITION}
              >
                {isMyTab ? (
                  <AnimatedMount layout className="mb-3">
                    <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <User size={12} />
                      {t('marketplace.myListings', { defaultValue: 'My listings' })}
                    </p>
                  </AnimatedMount>
                ) : (
                  <AnimatedMount layout className="mb-6">
                    {cityId && (
                      <p className="mb-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <MapPin size={12} />
                        {t('marketplace.listingsFromCity', {
                          defaultValue: 'Listings from {{city}} are shown',
                          city: (() => {
                            const city = user?.currentCity ?? cities.find((c) => c.id === cityId);
                            return city ? translateCity(city.id, city.name, city.country) : '';
                          })(),
                        })}
                      </p>
                    )}
                    <MarketplaceFilters
                      categoryId={filters.categoryId}
                      categories={categories}
                      onCategoryChange={(v) => setFilters((f) => ({ ...f, categoryId: v }))}
                      labels={{
                        allCategories: t('marketplace.allCategories', { defaultValue: 'All' }),
                      }}
                    />
                  </AnimatedMount>
                )}
                {listBody}
              </motion.div>
            </AnimatePresence>
          </TabContentStack>

          {selectedItem && (
            <MarketItemDrawer
              item={selectedItem}
              isOpen={!!selectedItem}
              onClose={closeDrawer}
              onItemUpdate={handleItemUpdate}
            />
          )}
        </div>
      )}
    </PullToRefreshShell>
  );
};
