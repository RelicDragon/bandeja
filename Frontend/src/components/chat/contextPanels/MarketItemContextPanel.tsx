import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Edit2, Trash2, BookMarked, ShoppingCart, DollarSign } from 'lucide-react';
import type { MarketItem, PriceCurrency } from '@/types';
import { marketplaceApi } from '@/api/marketplace';
import { currencyCacheService } from '@/services/currencyCache.service';
import { formatConvertedPrice, formatPrice } from '@/utils/currency';
import { useAuthStore } from '@/store/authStore';
import { PlayerAvatar } from '@/components';
import { ConfirmRemoveMarketItemModal } from '@/components/marketplace/ConfirmRemoveMarketItemModal';
import { AuctionBidSection } from '@/components/marketplace/AuctionBidSection';
import { useMarketItemReserve } from '@/components/marketplace/useMarketItemReserve';
import { useMarketItemExpressInterest } from '@/components/marketplace/useMarketItemExpressInterest';
interface MarketItemContextPanelProps {
  marketItem: MarketItem;
  userCurrency: PriceCurrency;
  onUpdate?: () => void;
  onItemUpdate?: (item: MarketItem) => void;
  onJoinChannel?: () => void;
  onEdit?: () => void;
  onCollapse?: () => void;
  shouldNavigate?: boolean;
}

export const MarketItemContextPanel = ({
  marketItem,
  userCurrency,
  onUpdate,
  onItemUpdate,
  onJoinChannel,
  onEdit,
  onCollapse,
  shouldNavigate = false,
}: MarketItemContextPanelProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const [isRemoving, setIsRemoving] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [priceDisplay, setPriceDisplay] = useState<{
    main: string;
    original: string;
    showBoth: boolean;
  } | null>(null);

  const isOwner = currentUser?.id === marketItem.sellerId;
  const isFree = marketItem.tradeTypes?.includes('FREE');

  const { handleReserveToggle, isReserving, isReserved } = useMarketItemReserve(marketItem, onItemUpdate ?? onUpdate);

  const { handleExpressInterest: expressInterest, expressingInterest } = useMarketItemExpressInterest(
    marketItem,
    {
      onJoinChannel: () => onJoinChannel?.(),
      shouldNavigate,
    }
  );

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
    if (onEdit) onEdit();
    else navigate(`/marketplace/${marketItem.id}/edit`);
  };

  const handleRemoveClick = () => {
    setShowRemoveModal(true);
  };

  const handleRemoveConfirm = async (status: 'SOLD' | 'WITHDRAWN') => {
    setIsRemoving(true);
    try {
      await marketplaceApi.withdrawMarketItem(marketItem.id, status);
      const successMessage = status === 'SOLD'
        ? t('marketplace.markedAsSold', { defaultValue: 'Listing marked as sold' })
        : t('marketplace.withdrawn', { defaultValue: 'Listing withdrawn' });
      toast.success(successMessage);
      setShowRemoveModal(false);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to update market item status:', error);
      toast.error(t('marketplace.updateFailed', { defaultValue: 'Failed to update listing' }));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {marketItem.seller && (
          <div className="flex items-center gap-2">
            <PlayerAvatar player={marketItem.seller} extrasmall fullHideName />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {marketItem.seller.firstName} {marketItem.seller.lastName}
            </span>
          </div>
        )}
        {marketItem.status === 'WITHDRAWN' && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-500/90 dark:bg-gray-600/90 text-white">
            {t('marketplace.status.withdrawn', { defaultValue: 'Withdrawn' })}
          </span>
        )}
        {marketItem.status === 'SOLD' && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-green-600/90 dark:bg-green-700/90 text-white">
            {t('marketplace.status.sold', { defaultValue: 'Sold' })}
          </span>
        )}
        {marketItem.status === 'RESERVED' && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-600/90 dark:bg-amber-700/90 text-white">
            {t('marketplace.status.reserved', { defaultValue: 'Reserved' })}
          </span>
        )}
      </div>

      {/* Price Display */}
      <div className="bg-gradient-to-br from-primary-50 to-primary-100/50 dark:from-primary-900/20 dark:to-primary-800/10 rounded-lg p-4 border border-primary-200 dark:border-primary-800/30">
        {isFree ? (
          <div className="flex items-center">
            <span className="inline-block px-4 py-1.5 rounded-lg text-xl font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
              {t('marketplace.free', { defaultValue: 'Free' })}
            </span>
          </div>
        ) : priceDisplay ? (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-primary-700 dark:text-primary-300">
              {priceDisplay.showBoth ? priceDisplay.original : priceDisplay.main}
            </span>
            {priceDisplay.showBoth && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {priceDisplay.main}
              </span>
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

      {/* Trade Type Buttons (for buyers) */}
      {!isOwner && (marketItem.status === 'ACTIVE' || marketItem.status === 'RESERVED') && (
        <div className="flex flex-col gap-2">
          {isFree && (
            <button
              onClick={() => { onCollapse?.(); expressInterest('FREE'); }}
              disabled={expressingInterest !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{t('marketplace.takeForFree', { defaultValue: 'Take for free' })}</span>
            </button>
          )}
          {marketItem.tradeTypes?.includes('AUCTION') && !marketItem.winnerId && (
            <AuctionBidSection
              marketItem={marketItem}
              userCurrency={userCurrency}
              isOwner={false}
              onItemUpdate={onItemUpdate}
              onCollapse={onCollapse}
            />
          )}
          {marketItem.tradeTypes?.includes('BUY_IT_NOW') && (
            <>
              {marketItem.negotiationAcceptable && (
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('marketplace.negotiationAcceptable', { defaultValue: 'Negotiation acceptable' })}</p>
              )}
              <button
                onClick={() => { onCollapse?.(); expressInterest('BUY_IT_NOW'); }}
                disabled={expressingInterest !== null}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingCart size={16} />
                <span>{t('marketplace.buyNow', { defaultValue: 'Buy now' })}</span>
              </button>
            </>
          )}
          {marketItem.tradeTypes?.includes('SUGGESTED_PRICE') && (
            <button
              onClick={() => { onCollapse?.(); expressInterest('SUGGESTED_PRICE'); }}
              disabled={expressingInterest !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DollarSign size={16} />
              <span>{t('marketplace.suggestYourPrice', { defaultValue: 'Suggest your price' })}</span>
            </button>
          )}
        </div>
      )}

      {/* Action Buttons (only for owner) */}
      {isOwner && (marketItem.status === 'ACTIVE' || marketItem.status === 'RESERVED') && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => { onCollapse?.(); handleEdit(); }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium text-sm"
            >
              <Edit2 size={16} />
              <span>{t('common.edit', { defaultValue: 'Edit' })}</span>
            </button>
            <button
              onClick={() => { onCollapse?.(); handleRemoveClick(); }}
              disabled={isRemoving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={16} />
              <span>{t('marketplace.remove', { defaultValue: 'Remove' })}</span>
            </button>
          </div>
          <button
            onClick={() => { onCollapse?.(); handleReserveToggle(); }}
            disabled={isReserving}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
              isReserved
                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/30'
            }`}
          >
            <BookMarked size={16} />
            <span>
              {isReserved
                ? t('marketplace.unreserve', { defaultValue: 'Unreserve' })
                : t('marketplace.reserve', { defaultValue: 'Reserve' })}
            </span>
          </button>
        </div>
      )}

      {/* Remove confirmation modal */}
      <ConfirmRemoveMarketItemModal
        isOpen={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        onConfirm={handleRemoveConfirm}
        isLoading={isRemoving}
      />
    </div>
  );
};
