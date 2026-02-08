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
import { MapPin, ShoppingBag, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [isEditing, setIsEditing] = useState(false);
  const mediaUrls = localItem.mediaUrls ?? [];
  const hasMultipleImages = mediaUrls.length > 1;
  const isSeller = user?.id === localItem.sellerId;

  const formatPrice = () => {
    if (localItem.priceCents != null) return `${(localItem.priceCents / 100).toFixed(2)} ${localItem.currency}`;
    return t('marketplace.suggestedPrice', { defaultValue: 'Haggling welcome' });
  };

  const tradeTypeLabels: Record<string, string> = {
    BUY_IT_NOW: t('marketplace.buyItNow', { defaultValue: 'Buy now' }),
    SUGGESTED_PRICE: t('marketplace.suggestedPrice', { defaultValue: 'Haggling welcome' }),
    AUCTION: t('marketplace.auction', { defaultValue: 'Auction' }),
  };

  const handleWithdraw = async () => {
    if (!confirm(t('marketplace.withdrawConfirm', { defaultValue: 'Withdraw this listing?' }))) return;
    setWithdrawing(true);
    try {
      await marketplaceApi.withdrawMarketItem(localItem.id);
      toast.success(t('marketplace.withdrawn', { defaultValue: 'Listing withdrawn' }));
      onItemUpdate?.(null);
      onClose();
      navigate('/marketplace');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to withdraw');
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
        <div className="aspect-square bg-gray-100 dark:bg-gray-800/80 relative flex-shrink-0">
          {mediaUrls[imageIndex] ? (
            <>
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
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ShoppingBag className="text-gray-300 dark:text-gray-600" size={80} strokeWidth={1} />
            </div>
          )}
        </div>
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
          {isSeller && localItem.status === 'ACTIVE' && (
            <>
              <Button variant="secondary" onClick={handleEdit}>
                {t('marketplace.edit', { defaultValue: 'Edit' })}
              </Button>
              <Button variant="danger" onClick={handleWithdraw} disabled={withdrawing}>
                {withdrawing ? t('common.loading') : t('marketplace.withdraw', { defaultValue: 'Withdraw' })}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
