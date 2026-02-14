import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';
import { MapPin, User } from 'lucide-react';
import { marketplaceApi, citiesApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useGroupChannelUnreadCounts } from '@/hooks/useGroupChannelUnreadCounts';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { MarketItem, MarketItemCategory, City, PriceCurrency } from '@/types';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { Button } from '@/components';
import { MarketItemCard, MarketplaceFilters, formatPriceDisplay, MarketItemDrawer } from '@/components/marketplace';
import { currencyCacheService } from '@/services/currencyCache.service';
import { DEFAULT_CURRENCY } from '@/utils/currency';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';

const PAGE_SIZE = 20;

export const MarketplaceList = () => {
  const { t } = useTranslation();
  const { translateCity } = useTranslatedGeo();
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
  const [filters, setFilters] = useState({ categoryId: '' });
  const itemIdFromUrl = searchParams.get('item') ?? null;
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);
  const channelIds = useMemo(
    () =>
      items.flatMap((item) =>
        item.groupChannel ? [item.groupChannel.id] : (item.groupChannels ?? []).map((c) => c.id)
      ),
    [items]
  );
  const unreadCounts = useGroupChannelUnreadCounts(channelIds);
  const getUnreadForItem = useCallback(
    (item: MarketItem) => {
      if (item.groupChannel) return unreadCounts[item.groupChannel.id] ?? 0;
      return (item.groupChannels ?? []).reduce((s, c) => s + (unreadCounts[c.id] ?? 0), 0);
    },
    [unreadCounts]
  );

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
        !isMyTab && page === 1 ? marketplaceApi.getCategories() : Promise.resolve({ data: [] }),
      ]);
      const pagination = (itemsRes as { data?: MarketItem[]; pagination?: { hasMore: boolean } }).pagination;
      setHasMore(pagination?.hasMore ?? false);
      pageRef.current = page;
      if (page === 1) {
        setItems(itemsRes.data || []);
        setCategories((categoriesRes as { data?: MarketItemCategory[] }).data || []);
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
  }, [cityId, filters.categoryId, isMyTab, user?.id]);

  useEffect(() => {
    pageRef.current = 1;
    fetchData();

    const userCurrency = (user?.defaultCurrency as PriceCurrency) || DEFAULT_CURRENCY;
    currencyCacheService.prefetch(userCurrency).catch((err) => {
      console.warn('[MarketplaceList] Failed to prefetch currency rates:', err);
    });
  }, [fetchData, user?.defaultCurrency]);

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

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: async () => {
      pageRef.current = 1;
      await fetchData(true);
    },
    disabled: loading,
  });

  return (
    <div className="pb-8">
      <RefreshIndicator isRefreshing={isRefreshing} pullDistance={pullDistance} pullProgress={pullProgress} />
      {isMyTab ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
          <User size={12} />
          {t('marketplace.myListings', { defaultValue: 'My listings' })}
        </p>
      ) : (
        <div className="mb-6">
          {cityId && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
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
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-10 w-10 border-2 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 dark:text-gray-400">{t('marketplace.noItems', { defaultValue: 'No listings found' })}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 [&>*]:w-[calc(50%-4px)] sm:[&>*]:w-[calc(33.333%-6px)] sm:[&>*]:max-w-[200px]">
          {items.map((item) => (
            <MarketItemCard
              key={item.id}
              item={item}
              formatPrice={formatPrice}
              tradeTypeLabel={tradeTypeLabels}
              unreadCount={getUnreadForItem(item) || undefined}
              showLocation={isMyTab}
              userCurrency={(user?.defaultCurrency as PriceCurrency) || DEFAULT_CURRENCY}
              onItemClick={openDrawer}
            />
          ))}
        </div>
      )}
      {selectedItem && (
        <MarketItemDrawer
          item={selectedItem}
          isOpen={!!selectedItem}
          onClose={closeDrawer}
          onItemUpdate={handleItemUpdate}
        />
      )}
      {hasMore && items.length > 0 && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore} className="min-w-[140px]">
            {loadingMore ? t('common.loading', { defaultValue: 'Loading...' }) : t('marketplace.loadMore', { defaultValue: 'Load more' })}
          </Button>
        </div>
      )}
    </div>
  );
};
