import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { MarketItem } from '@/types';
import { marketplaceApi } from '@/api/marketplace';
import { useAuthStore } from '@/store/authStore';
import { buildUrl } from '@/utils/urlSchema';

export type MarketItemChatButtonProps = {
  onClick: () => void;
  label: string;
  disabled: boolean;
  loading: boolean;
};

export function useMarketItemChatButton(
  marketItem: MarketItem,
  options: { onNavigate?: () => void } = {}
): { show: boolean; chatButtonProps: MarketItemChatButtonProps } {
  const { onNavigate } = options;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const [buyerChat, setBuyerChat] = useState<any | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);

  const isOwner = currentUser?.id === marketItem.sellerId;
  const show = (marketItem.status === 'ACTIVE' || marketItem.status === 'RESERVED') && !!currentUser;

  useEffect(() => {
    if (!currentUser || isOwner) return;
    setLoadingChat(true);
    marketplaceApi
      .getBuyerChat(marketItem.id)
      .then(setBuyerChat)
      .catch(() => setBuyerChat(null))
      .finally(() => setLoadingChat(false));
  }, [marketItem.id, currentUser, isOwner]);

  const doNavigate = (path: string) => {
    onNavigate?.();
    navigate(path);
  };

  const handleAskSeller = async () => {
    if (buyerChat) {
      doNavigate(buildUrl('channelChat', { id: buyerChat.id }));
      return;
    }
    setCreatingChat(true);
    try {
      const chat = await marketplaceApi.getOrCreateBuyerChat(marketItem.id);
      doNavigate(buildUrl('channelChat', { id: chat.id }));
    } catch {
      toast.error(t('marketplace.failedToOpenChat', { defaultValue: 'Failed to open chat' }));
    } finally {
      setCreatingChat(false);
    }
  };

  const handleViewConversations = () => {
    navigate(buildUrl('chatsMarketplace', { role: 'seller' }));
  };

  const onClick = isOwner ? handleViewConversations : handleAskSeller;
  const label = isOwner ? t('marketplace.chats') : t('marketplace.ask');
  const disabled = !isOwner && (creatingChat || loadingChat);
  const loading = !isOwner && (creatingChat || loadingChat);

  return {
    show,
    chatButtonProps: { onClick, label, disabled, loading },
  };
}
