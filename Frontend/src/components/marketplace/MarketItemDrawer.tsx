/**
 * @deprecated This component uses the OLD single public chat implementation.
 * Use MarketItemPanel wrapped in Drawer component instead for the new private buyer-seller chat system.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Drawer, DrawerContent, DrawerCloseButton } from '@/components/ui/Drawer';
import { marketplaceApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { MarketItem } from '@/types';
import { Button } from '@/components';
import { Badge } from '@/components/marketplace';
import { MarketItemEditForm } from './MarketItemEditForm';
import { MarketItemContextPanel } from '@/components/chat/contextPanels/MarketItemContextPanel';
import { resolveUserCurrency, DEFAULT_CURRENCY } from '@/utils/currency';
import { MessageCircle, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';

const TRADE_TYPE_BADGE = {
  BUY_IT_NOW: 'emerald' as const,
  SUGGESTED_PRICE: 'amber' as const,
  AUCTION: 'violet' as const,
};

export interface MarketItemDrawerProps {
  item: MarketItem;
  isOpen: boolean;
  onClose: () => void;
  groupChannelId?: string;
  isParticipant?: boolean;
  inChatContext?: boolean;
  onItemUpdate?: (item: MarketItem | null) => void;
}

export const MarketItemDrawer = ({
  item,
  isOpen,
  onClose,
  groupChannelId,
  isParticipant: propIsParticipant,
  inChatContext,
  onItemUpdate,
}: MarketItemDrawerProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [imageIndex, setImageIndex] = useState(0);
  const [localItem, setLocalItem] = useState(item);
  const [joining, setJoining] = useState(false);
  useEffect(() => { setLocalItem(item); }, [item]);
  const [isEditing, setIsEditing] = useState(false);
  const [localIsParticipant, setLocalIsParticipant] = useState(propIsParticipant ?? localItem.isParticipant ?? false);

  useEffect(() => {
    setLocalIsParticipant(propIsParticipant ?? localItem.isParticipant ?? false);
  }, [propIsParticipant, localItem.isParticipant]);

  const isParticipant = localIsParticipant;
  const channelId = groupChannelId ?? localItem.groupChannel?.id;
  const mediaUrls = (localItem.mediaUrls ?? []).filter((url): url is string => Boolean(url?.trim()));
  const hasMultipleImages = mediaUrls.length > 1;
  const hasPhoto = mediaUrls.length > 0;
  const userCurrency = resolveUserCurrency(user?.defaultCurrency) ?? DEFAULT_CURRENCY;

  const tradeTypeLabels: Record<string, string> = {
    BUY_IT_NOW: t('marketplace.buyItNow', { defaultValue: 'Buy now' }),
    SUGGESTED_PRICE: t('marketplace.suggestedPrice', { defaultValue: 'Haggling welcome' }),
    AUCTION: t('marketplace.auction', { defaultValue: 'Auction' }),
  };

  const handleOpenChat = async () => {
    if (!channelId || !user) return;
    if (!isParticipant) {
      setJoining(true);
      try {
        await marketplaceApi.joinMarketItemChat(localItem.id);
        setLocalItem((prev) => (prev ? { ...prev, isParticipant: true } : prev));
        onItemUpdate?.(localItem ? { ...localItem, isParticipant: true } : null);
      } catch (e: any) {
        toast.error(e.response?.data?.message || 'Failed to join chat');
        setJoining(false);
        return;
      }
      setJoining(false);
    }
    onClose();
    navigate(`/channel-chat/${channelId}`, { state: { fromPage: 'marketplace' } });
  };

  const handlePanelUpdate = () => {
    onItemUpdate?.(null);
    onClose();
    navigate('/marketplace');
  };

  const handleEditSave = (updatedItem: MarketItem) => {
    setLocalItem(updatedItem);
    onItemUpdate?.(updatedItem);
    setIsEditing(false);
    onClose();
  };

  const handleClose = () => (isEditing ? setIsEditing(false) : onClose());

  return (
    <>
      <Drawer open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DrawerContent className={`flex flex-col p-0 overflow-hidden rounded-t-3xl max-h-[80vh]`}>
          {!hasPhoto && (
            <div className="flex items-center justify-end p-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <DrawerCloseButton aria-label={t('common.close')} />
            </div>
          )}
          <div className={`overflow-y-auto max-h-[80vh]`}>
            {isEditing ? (
              <div className="p-4">
                <MarketItemEditForm item={localItem} onSave={handleEditSave} onCancel={() => setIsEditing(false)} />
              </div>
            ) : (
              <>
                {hasPhoto && (
                  <div className="aspect-square bg-gray-100 dark:bg-gray-800/80 relative flex-shrink-0 rounded-t-3xl overflow-hidden">
                    <div className="absolute top-2 right-2 z-10">
                      <DrawerCloseButton
                        aria-label={t('common.close')}
                        className="!bg-white/90 dark:!bg-gray-800/90 hover:!bg-white dark:hover:!bg-gray-700 !text-gray-700 dark:!text-gray-200 shadow-md"
                      />
                    </div>
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
                  <MarketItemContextPanel
                    marketItem={localItem}
                    userCurrency={userCurrency}
                    onUpdate={handlePanelUpdate}
                    onEdit={() => setIsEditing(true)}
                    shouldNavigate={true}
                  />
                  {!inChatContext && channelId && user && (
                    <Button
                      variant={isParticipant || (localItem.status !== 'ACTIVE' && localItem.status !== 'RESERVED') ? 'primary' : 'secondary'}
                      className="w-full flex items-center justify-center gap-2"
                      size={isParticipant || (localItem.status !== 'ACTIVE' && localItem.status !== 'RESERVED') ? 'lg' : 'md'}
                      onClick={handleOpenChat}
                      disabled={joining}
                    >
                      <MessageCircle size={18} className="shrink-0" />
                      {joining ? t('common.loading') : isParticipant ? t('marketplace.openChat', { defaultValue: 'Open chat' }) : t('marketplace.joinChat', { defaultValue: 'Join chat' })}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};
