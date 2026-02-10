import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { marketplaceApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { MarketItem } from '@/types';
import { Button } from '@/components';
import { Badge } from '@/components/marketplace';
import { MarketItemEditForm } from './MarketItemEditForm';
import { ConfirmRemoveMarketItemModal } from './ConfirmRemoveMarketItemModal';
import { useMarketItemReserve } from './useMarketItemReserve';
import { useMarketItemExpressInterest } from './useMarketItemExpressInterest';
import { MapPin, ChevronLeft, ChevronRight, BookMarked, ShoppingCart, DollarSign, Gavel, MessageCircle } from 'lucide-react';

const TRADE_TYPE_BADGE = {
  BUY_IT_NOW: 'emerald' as const,
  SUGGESTED_PRICE: 'amber' as const,
  AUCTION: 'violet' as const,
};

interface MarketItemPanelProps {
  item: MarketItem;
  onClose: () => void;
  onItemUpdate?: (item: MarketItem | null) => void;
}

export const MarketItemPanel = ({
  item,
  onClose,
  onItemUpdate,
}: MarketItemPanelProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [imageIndex, setImageIndex] = useState(0);
  const [localItem, setLocalItem] = useState(item);
  useEffect(() => { setLocalItem(item); }, [item]);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [buyerChat, setBuyerChat] = useState<any | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);

  const mediaUrls = (localItem.mediaUrls ?? []).filter((url): url is string => Boolean(url?.trim()));
  const hasMultipleImages = mediaUrls.length > 1;
  const hasPhoto = mediaUrls.length > 0;
  const isSeller = user?.id === localItem.sellerId;

  // Fetch buyer's chat on mount (if not seller)
  useEffect(() => {
    if (!user || isSeller) return;

    setLoadingChat(true);
    marketplaceApi.getBuyerChat(localItem.id)
      .then(chat => setBuyerChat(chat))
      .catch(() => setBuyerChat(null))
      .finally(() => setLoadingChat(false));
  }, [localItem.id, user, isSeller]);

  // Use the shared reserve hook
  const handleItemUpdate = (updatedItem: MarketItem) => {
    setLocalItem(updatedItem);
    onItemUpdate?.(updatedItem);
  };
  const { handleReserveToggle, isReserving, isReserved } = useMarketItemReserve(localItem, handleItemUpdate);

  // Use the shared express interest hook
  const { handleExpressInterest, expressingInterest } = useMarketItemExpressInterest(localItem, {
    shouldNavigate: true,
  });

  const formatPrice = () => {
    if (localItem.priceCents != null) return `${(localItem.priceCents / 100).toFixed(2)} ${localItem.currency}`;
    return t('marketplace.suggestedPrice', { defaultValue: 'Haggling welcome' });
  };

  const tradeTypeLabels: Record<string, string> = {
    BUY_IT_NOW: t('marketplace.buyItNow', { defaultValue: 'Buy now' }),
    SUGGESTED_PRICE: t('marketplace.suggestedPrice', { defaultValue: 'Haggling welcome' }),
    AUCTION: t('marketplace.auction', { defaultValue: 'Auction' }),
  };

  const handleRemoveClick = () => {
    setShowRemoveModal(true);
  };

  const handleRemoveConfirm = async (status: 'SOLD' | 'WITHDRAWN') => {
    setWithdrawing(true);
    try {
      await marketplaceApi.withdrawMarketItem(localItem.id, status);
      const successMessage = status === 'SOLD'
        ? t('marketplace.markedAsSold', { defaultValue: 'Listing marked as sold' })
        : t('marketplace.withdrawn', { defaultValue: 'Listing withdrawn' });
      toast.success(successMessage);
      onItemUpdate?.(null);
      setShowRemoveModal(false);
      onClose();
      navigate('/marketplace');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update listing');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleEditSave = (updatedItem: MarketItem) => {
    setLocalItem(updatedItem);
    onItemUpdate?.(updatedItem);
    setIsEditing(false);
    onClose();
  };

  const handleEditCancel = () => {
    setIsEditing(false);
  };

  // Handler for "Ask seller" button (creates chat without message)
  const handleAskSeller = async () => {
    if (buyerChat) {
      // Chat exists, just navigate
      navigate(`/channel-chat/${buyerChat.id}`);
      onClose();
      return;
    }

    // Create chat without message
    setCreatingChat(true);
    try {
      const chat = await marketplaceApi.getOrCreateBuyerChat(localItem.id);
      navigate(`/channel-chat/${chat.id}`);
      onClose();
    } catch (error) {
      toast.error(t('marketplace.failedToOpenChat', { defaultValue: 'Failed to open chat' }));
    } finally {
      setCreatingChat(false);
    }
  };

  if (isEditing) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto p-4">
          <MarketItemEditForm item={localItem} onSave={handleEditSave} onCancel={handleEditCancel} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto">
        {hasPhoto && (
          <div className="aspect-square bg-gray-100 dark:bg-gray-800/80 relative flex-shrink-0">
            <img src={mediaUrls[imageIndex]} alt={localItem.title} className="w-full h-full object-cover" />
            {hasMultipleImages && (
              <>
                <button
                  type="button"
                  onClick={() => setImageIndex((i) => (i - 1 + mediaUrls.length) % mediaUrls.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => setImageIndex((i) => (i + 1) % mediaUrls.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  <ChevronRight size={20} />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {mediaUrls.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setImageIndex(i)}
                      className={`w-2 h-2 rounded-full transition-colors ${i === imageIndex ? 'bg-white' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <div className="p-6">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{localItem.title}</h1>
          <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-2">{formatPrice()}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(localItem.tradeTypes ?? []).map((tt) => (
              <Badge key={tt} variant={TRADE_TYPE_BADGE[tt]}>{tradeTypeLabels[tt] || tt}</Badge>
            ))}
          </div>
          {localItem.description && (
            <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed">{localItem.description}</p>
          )}
          <div className="mt-4 flex flex-col gap-2 text-sm text-gray-500 dark:text-gray-400">
            {localItem.city && (
              <span className="flex items-center gap-2">
                <MapPin size={16} />
                {localItem.city.name}
              </span>
            )}
            {localItem.seller && (
              <span>
                {localItem.seller.firstName} {localItem.seller.lastName}
              </span>
            )}
          </div>
        </div>
        <div className="px-6 pb-6 flex flex-col gap-3">
          {!isSeller && (localItem.status === 'ACTIVE' || localItem.status === 'RESERVED') && (
            <>
              {/* Ask seller button */}
              <Button
                variant="secondary"
                onClick={handleAskSeller}
                disabled={creatingChat || loadingChat}
              >
                <MessageCircle size={16} className="inline mr-2" />
                {buyerChat
                  ? t('marketplace.openMyChat', { defaultValue: 'Open my chat' })
                  : t('marketplace.askSeller', { defaultValue: 'Ask seller' })}
              </Button>

              {/* Express interest buttons */}
              {(localItem.tradeTypes ?? []).includes('BUY_IT_NOW') && (
                <Button
                  variant="primary"
                  onClick={() => handleExpressInterest('BUY_IT_NOW')}
                  disabled={expressingInterest !== null}
                  className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                >
                  <ShoppingCart size={16} className="inline mr-2" />
                  {t('marketplace.buyNow', { defaultValue: 'Buy now' })}
                </Button>
              )}
              {(localItem.tradeTypes ?? []).includes('SUGGESTED_PRICE') && (
                <Button
                  variant="secondary"
                  onClick={() => handleExpressInterest('SUGGESTED_PRICE')}
                  disabled={expressingInterest !== null}
                  className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                >
                  <DollarSign size={16} className="inline mr-2" />
                  {t('marketplace.makeOffer', { defaultValue: 'Make an offer' })}
                </Button>
              )}
              {(localItem.tradeTypes ?? []).includes('AUCTION') && (
                <Button
                  variant="secondary"
                  onClick={() => handleExpressInterest('AUCTION')}
                  disabled={expressingInterest !== null}
                  className="border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                >
                  <Gavel size={16} className="inline mr-2" />
                  {t('marketplace.placeBid', { defaultValue: 'Place a bid' })}
                </Button>
              )}
            </>
          )}
          {isSeller && (localItem.status === 'ACTIVE' || localItem.status === 'RESERVED') && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  navigate(`/marketplace/${localItem.id}/chats`);
                  onClose();
                }}
              >
                <MessageCircle size={16} className="inline mr-2" />
                {t('marketplace.viewConversations', { defaultValue: 'View conversations' })}
              </Button>
              <Button variant="secondary" onClick={handleEdit}>
                {t('marketplace.edit', { defaultValue: 'Edit' })}
              </Button>
              <Button
                variant={isReserved ? 'secondary' : 'primary'}
                onClick={handleReserveToggle}
                disabled={isReserving}
              >
                <BookMarked size={16} className="inline mr-2" />
                {isReserved
                  ? t('marketplace.unreserve', { defaultValue: 'Unreserve' })
                  : t('marketplace.reserve', { defaultValue: 'Reserve' })}
              </Button>
              <Button variant="danger" onClick={handleRemoveClick} disabled={withdrawing}>
                {t('marketplace.remove', { defaultValue: 'Remove' })}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Remove confirmation modal */}
      <ConfirmRemoveMarketItemModal
        isOpen={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        onConfirm={handleRemoveConfirm}
        isLoading={withdrawing}
      />
    </div>
  );
};
