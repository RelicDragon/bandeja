import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Edit2, Trash2 } from 'lucide-react';
import type { MarketItem, PriceCurrency } from '@/types';
import { marketplaceApi } from '@/api/marketplace';
import { currencyCacheService } from '@/services/currencyCache.service';
import { formatConvertedPrice, formatPrice } from '@/utils/currency';
import { useAuthStore } from '@/store/authStore';

interface MarketItemContextPanelProps {
  marketItem: MarketItem;
  userCurrency: PriceCurrency;
  onUpdate?: () => void;
}

export const MarketItemContextPanel = ({
  marketItem,
  userCurrency,
  onUpdate,
}: MarketItemContextPanelProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const [isRemoving, setIsRemoving] = useState(false);
  const [priceDisplay, setPriceDisplay] = useState<{
    main: string;
    original: string;
    showBoth: boolean;
  } | null>(null);

  // Check if current user is the seller
  const isOwner = currentUser?.id === marketItem.sellerId;

  useEffect(() => {
    // Convert price to user's currency if different
    const convertPrice = async () => {
      if (!marketItem.priceCents || !marketItem.currency) {
        setPriceDisplay(null);
        return;
      }

      const originalCurrency = marketItem.currency as PriceCurrency;

      if (originalCurrency === userCurrency) {
        // No conversion needed
        setPriceDisplay({
          main: formatPrice(marketItem.priceCents, originalCurrency),
          original: '',
          showBoth: false,
        });
      } else {
        // Convert to user's currency
        try {
          const convertedCents = await currencyCacheService.convertPrice(
            marketItem.priceCents,
            originalCurrency,
            userCurrency
          );

          const formatted = formatConvertedPrice(
            marketItem.priceCents,
            originalCurrency,
            convertedCents,
            userCurrency
          );

          setPriceDisplay(formatted);
        } catch (err) {
          console.warn('[MarketItemContextPanel] Failed to convert price:', err);
          // Fallback to original price
          setPriceDisplay({
            main: formatPrice(marketItem.priceCents, originalCurrency),
            original: '',
            showBoth: false,
          });
        }
      }
    };

    convertPrice();
  }, [marketItem, userCurrency]);

  const handleEdit = () => {
    navigate(`/marketplace/${marketItem.id}/edit`);
  };

  const handleRemove = async () => {
    if (!confirm(t('marketplace.withdrawConfirm', { defaultValue: 'Are you sure you want to withdraw this listing?' }))) {
      return;
    }

    setIsRemoving(true);
    try {
      await marketplaceApi.withdrawMarketItem(marketItem.id);
      toast.success(t('marketplace.withdrawn', { defaultValue: 'Listing withdrawn' }));
      onUpdate?.();
    } catch (error) {
      console.error('Failed to withdraw market item:', error);
      toast.error(t('marketplace.withdrawFailed', { defaultValue: 'Failed to withdraw listing' }));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Price Display */}
      <div className="bg-gradient-to-br from-primary-50 to-primary-100/50 dark:from-primary-900/20 dark:to-primary-800/10 rounded-lg p-4 border border-primary-200 dark:border-primary-800/30">
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
          {t('marketplace.price', { defaultValue: 'Price' })}
        </div>
        {priceDisplay ? (
          <div>
            <div className="text-2xl font-bold text-primary-700 dark:text-primary-300">
              {priceDisplay.main}
            </div>
            {priceDisplay.showBoth && (
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {priceDisplay.original}
              </div>
            )}
          </div>
        ) : marketItem.priceCents ? (
          <div className="text-2xl font-bold text-primary-700 dark:text-primary-300">
            {formatPrice(marketItem.priceCents, marketItem.currency as PriceCurrency)}
          </div>
        ) : (
          <div className="text-xl font-semibold text-gray-500 dark:text-gray-400">
            {t('marketplace.priceNotSet', { defaultValue: 'Price not set' })}
          </div>
        )}
      </div>

      {/* Action Buttons (only for owner) */}
      {isOwner && marketItem.status === 'ACTIVE' && (
        <div className="flex gap-2">
          <button
            onClick={handleEdit}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium text-sm"
          >
            <Edit2 size={16} />
            <span>{t('common.edit', { defaultValue: 'Edit' })}</span>
          </button>
          <button
            onClick={handleRemove}
            disabled={isRemoving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={16} />
            <span>
              {isRemoving
                ? t('common.removing', { defaultValue: 'Removing...' })
                : t('common.remove', { defaultValue: 'Remove' })}
            </span>
          </button>
        </div>
      )}

      {/* Status indicator for non-active items */}
      {marketItem.status !== 'ACTIVE' && (
        <div className="text-center py-2 px-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {t(`marketplace.status.${marketItem.status.toLowerCase()}`, { defaultValue: marketItem.status })}
          </span>
        </div>
      )}
    </div>
  );
};
