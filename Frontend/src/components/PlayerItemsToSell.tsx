import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MarketItem, PriceCurrency } from '@/types';
import { marketplaceApi } from '@/api/marketplace';
import { MarketItemCard, formatPriceDisplay } from '@/components/marketplace';
import { resolveUserCurrency, DEFAULT_CURRENCY } from '@/utils/currency';
import { useAuthStore } from '@/store/authStore';

interface PlayerItemsToSellProps {
  userId: string;
  onItemClick?: (item: MarketItem) => void;
}

export const PlayerItemsToSell = ({ userId, onItemClick }: PlayerItemsToSellProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const userCurrency = (resolveUserCurrency(user?.defaultCurrency) ?? DEFAULT_CURRENCY) as PriceCurrency;
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    marketplaceApi
      .getMarketItems({ sellerId: userId, status: 'ACTIVE', limit: 50 })
      .then((res) => {
        if (!cancelled) setItems(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const formatPrice = useCallback(
    (item: MarketItem) =>
      formatPriceDisplay(
        item,
        t('marketplace.suggestedPrice', { defaultValue: 'Haggling welcome' }),
        t('marketplace.free', { defaultValue: 'Free' })
      ),
    [t]
  );

  const tradeTypeLabels: Record<string, string> = {
    BUY_IT_NOW: t('marketplace.buyItNow', { defaultValue: 'Buy now' }),
    SUGGESTED_PRICE: t('marketplace.suggestedPrice', { defaultValue: 'Haggling welcome' }),
    AUCTION: t('marketplace.auction', { defaultValue: 'Auction' }),
  };

  if (loading || items.length === 0) return null;

  return (
    <motion.div
      className="space-y-3"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 px-1">
        {t('playerCard.itemsToSell')}
      </h3>
      <div className="overflow-x-auto overflow-y-hidden -mx-6 px-6 scrollbar-hide">
        <div className="flex gap-3 pb-2" style={{ minWidth: 'min-content' }}>
          {items.map((item) => (
            <div key={item.id} className="flex-shrink-0 w-[160px]">
              <MarketItemCard
                item={item}
                formatPrice={formatPrice}
                tradeTypeLabel={tradeTypeLabels}
                userCurrency={userCurrency}
                showLocation={false}
                onItemClick={onItemClick}
              />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
