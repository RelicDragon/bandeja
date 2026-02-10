import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, User } from 'lucide-react';
import { marketplaceApi, citiesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { MarketItem, MarketItemCategory, City, PriceCurrency } from '@/types';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { Button } from '@/components';
import { MarketItemCard, MarketplaceFilters, formatPriceDisplay } from '@/components/marketplace';
import { currencyCacheService } from '@/services/currencyCache.service';
import { DEFAULT_CURRENCY } from '@/utils/currency';

const PAGE_SIZE = 20;

export const MarketplaceList = () => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const marketplaceTab = useNavigationStore((state) => state.marketplaceTab);
  const isMyTab = marketplaceTab === 'my';
  const [items, setItems] = useState<MarketItem[]>([]);
  const [categories, setCategories] = useState<MarketItemCategory[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);
  const cityId = (user?.currentCity?.id || user?.currentCityId) ?? '';
  const [filters, setFilters] = useState({ categoryId: '' });
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const lastChatUnreadCount = useSocketEventsStore((state) => state.lastChatUnreadCount);

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

    // Prefetch exchange rates for user's currency
    const userCurrency = (user?.defaultCurrency as PriceCurrency) || DEFAULT_CURRENCY;
    currencyCacheService.prefetch(userCurrency).catch((err) => {
      console.warn('[MarketplaceList] Failed to prefetch currency rates:', err);
    });
  }, [fetchData, user?.defaultCurrency]);

  useEffect(() => {
    const groupIds = items
      .map((item) => item.groupChannel?.id)
      .filter((id): id is string => !!id);
    if (groupIds.length === 0) return;
    chatApi.getGroupChannelsUnreadCounts(groupIds).then((res) => {
      setUnreadCounts(res.data || {});
    }).catch(() => {});
  }, [items]);

  useEffect(() => {
    if (!lastChatUnreadCount || lastChatUnreadCount.contextType !== 'GROUP') return;
    const { contextId, unreadCount } = lastChatUnreadCount;
    const isOurs = items.some((item) => item.groupChannel?.id === contextId);
    if (isOurs) {
      setUnreadCounts((prev) => ({ ...prev, [contextId]: unreadCount }));
    }
  }, [lastChatUnreadCount, items]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    pageRef.current += 1;
    setLoadingMore(true);
    fetchData();
  }, [fetchData, loadingMore, hasMore]);

  const formatPrice = useCallback((item: MarketItem) => formatPriceDisplay(item, t('marketplace.suggestedPrice', { defaultValue: 'Haggling welcome' })), [t]);
  const tradeTypeLabels = {
    BUY_IT_NOW: t('marketplace.buyItNow', { defaultValue: 'Buy now' }),
    SUGGESTED_PRICE: t('marketplace.suggestedPrice', { defaultValue: 'Haggling welcome' }),
    AUCTION: t('marketplace.auction', { defaultValue: 'Auction' }),
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
                city: user?.currentCity?.name ?? cities.find((c) => c.id === cityId)?.name ?? '',
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
              unreadCount={item.groupChannel?.id ? unreadCounts[item.groupChannel.id] : undefined}
              showLocation={isMyTab}
              userCurrency={(user?.defaultCurrency as PriceCurrency) || DEFAULT_CURRENCY}
            />
          ))}
        </div>
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
