import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketItem, PriceCurrency } from '@/types';
import { MapPin } from 'lucide-react';
import { currencyCacheService } from '@/services/currencyCache.service';
import { formatConvertedPrice } from '@/utils/currency';

const TRADE_TYPE_BADGE_CLASS = {
  BUY_IT_NOW: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  SUGGESTED_PRICE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  AUCTION: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
} as const;

interface MarketItemCardProps {
  item: MarketItem;
  formatPrice: (item: MarketItem) => string;
  tradeTypeLabel: Record<string, string>;
  unreadCount?: number;
  showLocation?: boolean;
  userCurrency: PriceCurrency;
  onItemClick?: (item: MarketItem) => void;
}

export const MarketItemCard = ({ item, formatPrice, tradeTypeLabel, unreadCount, showLocation = false, userCurrency, onItemClick }: MarketItemCardProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const fromSubtab = location.pathname === '/marketplace/my' ? 'my' as const : 'market' as const;
  const imageUrl = item.mediaUrls?.[0];
  const [priceDisplay, setPriceDisplay] = useState<{
    main: string;
    original: string;
    showBoth: boolean;
  } | null>(null);

  useEffect(() => {
    // Convert price to user's currency if different
    const convertPrice = async () => {
      if (!item.priceCents || !item.currency) {
        setPriceDisplay(null);
        return;
      }

      const originalCurrency = item.currency as PriceCurrency;

      if (originalCurrency === userCurrency) {
        // No conversion needed
        setPriceDisplay({
          main: formatPrice(item),
          original: '',
          showBoth: false,
        });
      } else {
        // Convert to user's currency
        try {
          const convertedCents = await currencyCacheService.convertPrice(
            item.priceCents,
            originalCurrency,
            userCurrency
          );

          const formatted = formatConvertedPrice(
            item.priceCents,
            originalCurrency,
            convertedCents,
            userCurrency
          );

          setPriceDisplay(formatted);
        } catch (err) {
          console.warn('[MarketItemCard] Failed to convert price:', err);
          // Fallback to original price
          setPriceDisplay({
            main: formatPrice(item),
            original: '',
            showBoth: false,
          });
        }
      }
    };

    convertPrice();
  }, [item, userCurrency, formatPrice]);

  const isWithdrawn = item.status === 'WITHDRAWN';
  const isSold = item.status === 'SOLD';
  const isReserved = item.status === 'RESERVED';
  const isInactive = isWithdrawn || isSold || isReserved;
  const isFree = item.tradeTypes?.includes('FREE');

  const handleClick = () => {
    if (onItemClick) {
      onItemClick(item);
    } else if (item.groupChannel?.id) {
      navigate(`/channel-chat/${item.groupChannel.id}`, { state: { fromPage: 'marketplace' } });
    } else {
      navigate(`/marketplace/${item.id}`, { state: { fromMarketplaceSubtab: fromSubtab } });
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className={`group relative overflow-hidden rounded-xl border shadow-sm transition-all duration-300 active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 flex flex-col ${
        isInactive
          ? 'bg-gray-100 dark:bg-slate-800/50 border-gray-300 dark:border-slate-600 opacity-75'
          : 'bg-white dark:bg-slate-800/80 border-gray-200 dark:border-slate-600 dark:shadow-black/20 hover:shadow-lg dark:hover:shadow-black/30 hover:border-primary-200 dark:hover:border-primary-700/50'
      }`}
    >
      {imageUrl && (
        <div className={`aspect-square bg-slate-100 dark:bg-slate-700/80 overflow-hidden relative flex-shrink-0 ${isInactive ? 'grayscale' : ''}`}>
          <img
            src={imageUrl}
            alt={item.title}
            className={`w-full h-full object-cover transition-transform duration-300 ${isInactive ? '' : 'group-hover:scale-105'}`}
          />
          {item.mediaUrls && item.mediaUrls.length > 1 && (
            <div className="absolute bottom-1 right-1 px-1.5 py-px rounded-full bg-black/60 dark:bg-black/70 text-white text-[10px] font-medium">
              {item.mediaUrls.length}
            </div>
          )}
        </div>
      )}
      {isWithdrawn && (
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-gray-500/90 dark:bg-gray-600/90 text-white text-[10px] font-medium z-10">
          {t('marketplace.status.withdrawn', { defaultValue: 'Withdrawn' })}
        </div>
      )}
      {isSold && (
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-green-600/90 dark:bg-green-700/90 text-white text-[10px] font-medium z-10">
          {t('marketplace.status.sold', { defaultValue: 'Sold' })}
        </div>
      )}
      {isReserved && (
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-amber-600/90 dark:bg-amber-700/90 text-white text-[10px] font-medium z-10">
          {t('marketplace.status.reserved', { defaultValue: 'Reserved' })}
        </div>
      )}
      {unreadCount != null && unreadCount > 0 && (
        <div className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-lg shadow-red-500/30 z-10">
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
      <div className={`p-2 mt-auto ${!imageUrl && isInactive ? 'pt-7' : ''}`}>
        <p className={`text-sm font-semibold truncate ${isInactive ? 'text-gray-500 dark:text-gray-400' : 'text-slate-900 dark:text-slate-100'}`}>{item.title}</p>
        {isFree ? (
          <div className="mt-0.5">
            <span className="inline-block px-2 py-0.5 rounded text-sm font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
              {t('marketplace.free', { defaultValue: 'Free' })}
            </span>
          </div>
        ) : priceDisplay ? (
          <div className="mt-0.5">
            <p className={`text-sm font-semibold ${isInactive ? 'text-gray-500 dark:text-gray-400' : 'text-primary-600 dark:text-primary-400'}`}>
              {priceDisplay.main}
            </p>
            {priceDisplay.showBoth && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {priceDisplay.original}
              </p>
            )}
          </div>
        ) : (
          <p className={`text-sm font-semibold mt-0.5 ${isInactive ? 'text-gray-500 dark:text-gray-400' : 'text-primary-600 dark:text-primary-400'}`}>
            {formatPrice(item)}
          </p>
        )}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {(item.tradeTypes ?? []).filter((tt) => tt !== 'BUY_IT_NOW' && tt !== 'FREE').map((tt) => (
            <span
              key={tt}
              className={`px-1.5 py-0.5 rounded text-xs font-medium ${TRADE_TYPE_BADGE_CLASS[tt as keyof typeof TRADE_TYPE_BADGE_CLASS] || 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300'}`}
            >
              {tradeTypeLabel[tt] || tt}
            </span>
          ))}
          {showLocation && item.city && (
            <span className="flex items-center gap-0.5 text-xs text-slate-500 dark:text-slate-400">
              <MapPin size={12} />
              {item.city.name}
              {item.additionalCityIds && item.additionalCityIds.length > 0 && (
                <span className="text-xs opacity-70">
                  +{item.additionalCityIds.length}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </article>
  );
};
