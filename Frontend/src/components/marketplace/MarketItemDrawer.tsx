import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Drawer, DrawerContent, DrawerClose } from '@/components/ui/Drawer';
import { Button } from '@/components';
import { marketplaceApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useGroupChannelUnreadCounts } from '@/hooks/useGroupChannelUnreadCounts';
import { MarketItem } from '@/types';
import { MarketItemPanel } from './MarketItemPanel';
import { MessageCircle, X } from 'lucide-react';

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
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const fromSubtab = location.pathname === '/marketplace/my' ? ('my' as const) : ('market' as const);
  const [localItem, setLocalItem] = useState(item);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalItem(item);
    }
  }, [isOpen, item]);

  const isParticipant = propIsParticipant ?? localItem.isParticipant ?? false;
  const channelId = groupChannelId ?? localItem.groupChannel?.id;
  const channelIds = useMemo(
    () =>
      channelId ? [channelId] : (localItem.groupChannels ?? []).map((c) => c.id),
    [channelId, localItem.groupChannels]
  );
  const unreadCounts = useGroupChannelUnreadCounts(channelIds);
  const unreadCount =
    channelId
      ? (unreadCounts[channelId] ?? 0)
      : (localItem.groupChannels ?? []).reduce((s, c) => s + (unreadCounts[c.id] ?? 0), 0);

  const handleItemUpdate = (updated: MarketItem | null) => {
    setLocalItem(updated ?? item);
    onItemUpdate?.(updated);
  };

  const handleOpenChat = async () => {
    if (!channelId || !user) return;
    if (!isParticipant) {
      setJoining(true);
      try {
        await marketplaceApi.joinMarketItemChat(localItem.id);
        const updatedItem = { ...localItem, isParticipant: true };
        setLocalItem(updatedItem);
        onItemUpdate?.(updatedItem);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } };
        toast.error(err.response?.data?.message || 'Failed to join chat');
        setJoining(false);
        return;
      }
      setJoining(false);
    }
    onClose();
    navigate(`/channel-chat/${channelId}`, { state: { fromPage: 'marketplace', fromMarketplaceSubtab: fromSubtab } });
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="flex flex-col p-0 max-h-[80vh] overflow-hidden !pb-0">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <MarketItemPanel
            item={localItem}
            onClose={onClose}
            onItemUpdate={handleItemUpdate}
          />
          {!inChatContext && channelId && user && (
            <div className="px-6 pb-6">
              <Button
                variant={isParticipant || (localItem.status !== 'ACTIVE' && localItem.status !== 'RESERVED') ? 'primary' : 'secondary'}
                className="w-full flex items-center justify-center gap-2 relative"
                size={isParticipant || (localItem.status !== 'ACTIVE' && localItem.status !== 'RESERVED') ? 'lg' : 'md'}
                onClick={handleOpenChat}
                disabled={joining}
              >
                <MessageCircle size={18} className="shrink-0" />
                {unreadCount > 0 && (
                  <span className="absolute top-1/2 -translate-y-1/2 right-4 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-medium">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                {joining
                  ? t('common.loading')
                  : isParticipant
                    ? t('marketplace.openChat', { defaultValue: 'Open chat' })
                    : t('marketplace.joinChat', { defaultValue: 'Join chat' })}
              </Button>
            </div>
          )}
          <div className="h-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }} />
        </div>

        <div className="absolute top-3 right-3 z-50">
          <DrawerClose asChild>
            <button
              type="button"
              className="p-2 rounded-full bg-black/50 text-white shadow-lg hover:bg-black/70 transition-colors"
              aria-label={t('common.close')}
            >
              <X size={20} />
            </button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
