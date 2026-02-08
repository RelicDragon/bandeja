import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { marketplaceApi, citiesApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { MarketItem, MarketItemCategory, City } from '@/types';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { Button } from '@/components';
import { MarketItemCard, MarketplaceFilters, formatPriceDisplay } from '@/components/marketplace';

const PAGE_SIZE = 20;

export const MarketplaceList = () => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [items, setItems] = useState<MarketItem[]>([]);
  const [categories, setCategories] = useState<MarketItemCategory[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(1);
  const cityId = (user?.currentCity?.id || user?.currentCityId) ?? '';
  const [filters, setFilters] = useState({ categoryId: '' });

  const fetchData = useCallback(async (refresh = false) => {
    const page = refresh ? 1 : pageRef.current;
    setLoading(page === 1);
    setLoadingMore(page > 1);
    try {
      const [itemsRes, categoriesRes] = await Promise.all([
        marketplaceApi.getMarketItems({
          cityId: cityId || undefined,
          categoryId: filters.categoryId || undefined,
          page,
          limit: PAGE_SIZE,
        }),
        page === 1 ? marketplaceApi.getCategories() : Promise.resolve({ data: [] }),
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
  }, [cityId, filters.categoryId]);

  useEffect(() => {
    pageRef.current = 1;
    fetchData();
  }, [fetchData]);

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

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-10 w-10 border-2 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 dark:text-gray-400">{t('marketplace.noItems', { defaultValue: 'No listings found' })}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <MarketItemCard key={item.id} item={item} formatPrice={formatPrice} tradeTypeLabel={tradeTypeLabels} />
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
