import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { MarketItem, PriceCurrency } from '@/types';
import { buildUrl } from '@/utils/urlSchema';
import { MapPin } from 'lucide-react';
import { currencyCacheService } from '@/services/currencyCache.service';
import { formatConvertedPrice } from '@/utils/currency';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { MarketItemCardMedia } from './MarketItemCardMedia';
import { UnreadBadge } from '@/components/UnreadBadge';

const TRADE_TYPE_BADGE_CLASS = {
  BUY_IT_NOW: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  SUGGESTED_PRICE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  AUCTION: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  FREE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
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
  const { translateCity } = useTranslatedGeo();
  const navigate = useNavigate();
  const reduceMotion = usePrefersReducedMotion();
  const imageUrl = item.mediaUrls?.[0];
  const [priceDisplay, setPriceDisplay] = useState<{
    main: string;
    original: string;
    showBoth: boolean;
  } | null>(null);
  const priceKey = priceDisplay
    ? `${priceDisplay.main}-${priceDisplay.original}-${priceDisplay.showBoth}`
    : 'pending';

  useEffect(() => {
    const convertPrice = async () => {
      if (!item.priceCents || !item.currency) {
        setPriceDisplay(null);
        return;
      }

      const originalCurrency = item.currency as PriceCurrency;

      if (originalCurrency === userCurrency) {
        setPriceDisplay({
          main: formatPrice(item),
          original: '',
          showBoth: false,
        });
      } else {
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
      navigate(buildUrl('channelChat', { id: item.groupChannel.id, filter: 'market' }));
    } else {
      navigate(buildUrl('marketplaceItem', { id: item.id }));
    }
  };

  const cardClassName = `group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border shadow-sm transition-shadow duration-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
    isInactive
      ? 'border-gray-300 bg-gray-100 opacity-75 dark:border-slate-600 dark:bg-slate-800/50'
      : 'border-gray-200 bg-white hover:border-primary-200 hover:shadow-lg dark:border-slate-600 dark:bg-slate-800/80 dark:shadow-black/20 dark:hover:border-primary-700/50 dark:hover:shadow-black/30'
  }`;

  const cardBody = (
    <>
      <MarketItemCardMedia
        imageUrl={imageUrl}
        title={item.title}
        mediaCount={item.mediaUrls?.length ?? 0}
        inactive={isInactive}
      />
      {isWithdrawn && (
        <StatusBadge label={t('marketplace.status.withdrawn', { defaultValue: 'Withdrawn' })} className="bg-gray-500/90 dark:bg-gray-600/90" />
      )}
      {isSold && (
        <StatusBadge label={t('marketplace.status.sold', { defaultValue: 'Sold' })} className="bg-green-600/90 dark:bg-green-700/90" />
      )}
      {isReserved && (
        <StatusBadge label={t('marketplace.status.reserved', { defaultValue: 'Reserved' })} className="bg-amber-600/90 dark:bg-amber-700/90" />
      )}
      <UnreadBadge count={unreadCount ?? 0} size="sm" className="absolute right-1.5 top-1.5 z-10" />
      <div className={`mt-auto p-2 ${!imageUrl && isInactive ? 'pt-7' : ''}`}>
        <p className={`truncate text-sm font-semibold ${isInactive ? 'text-gray-500 dark:text-gray-400' : 'text-slate-900 dark:text-slate-100'}`}>{item.title}</p>
        {isFree ? (
          <div className="mt-0.5">
            <span className="inline-block rounded px-2 py-0.5 text-sm font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
              {t('marketplace.free', { defaultValue: 'Free' })}
            </span>
          </div>
        ) : (
          <div className="relative mt-0.5 min-h-[1.25rem]">
            <AnimatePresence mode="wait" initial={false}>
              {priceDisplay ? (
                <motion.div
                  key={priceKey}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  <p className={`text-sm font-semibold ${isInactive ? 'text-gray-500 dark:text-gray-400' : 'text-primary-600 dark:text-primary-400'}`}>
                    {priceDisplay.showBoth ? priceDisplay.original : priceDisplay.main}
                  </p>
                  {priceDisplay.showBoth && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{priceDisplay.main}</p>
                  )}
                </motion.div>
              ) : (
                <motion.p
                  key="fallback-price"
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`text-sm font-semibold ${isInactive ? 'text-gray-500 dark:text-gray-400' : 'text-primary-600 dark:text-primary-400'}`}
                >
                  {formatPrice(item)}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {(item.tradeTypes ?? []).slice(0, 1).map((tt) => (
            <span
              key={tt}
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${TRADE_TYPE_BADGE_CLASS[tt as keyof typeof TRADE_TYPE_BADGE_CLASS] || 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300'}`}
            >
              {tradeTypeLabel[tt] || tt}
            </span>
          ))}
          {showLocation && item.city && (
            <span className="flex items-center gap-0.5 text-xs text-slate-500 dark:text-slate-400">
              <MapPin size={12} />
              {translateCity(item.city.id, item.city.name, item.city.country)}
              {item.additionalCityIds && item.additionalCityIds.length > 0 && (
                <span className="text-xs opacity-70">+{item.additionalCityIds.length}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (reduceMotion) {
    return (
      <article
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        className={cardClassName}
      >
        {cardBody}
      </article>
    );
  }

  return (
    <motion.article
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      className={cardClassName}
    >
      {cardBody}
    </motion.article>
  );
};

function StatusBadge({ label, className }: { label: string; className: string }) {
  const reduceMotion = usePrefersReducedMotion();
  const Tag = reduceMotion ? 'div' : motion.div;

  return (
    <Tag
      initial={reduceMotion ? undefined : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      className={`absolute left-1.5 top-1.5 z-10 rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${className}`}
    >
      {label}
    </Tag>
  );
}
