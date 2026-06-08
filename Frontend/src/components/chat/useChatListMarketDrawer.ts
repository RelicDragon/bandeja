import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { marketplaceApi } from '@/api/marketplace';
import type { GroupChannel } from '@/api/chat';
import type { MarketItem } from '@/types';
import type { ChatItem } from './chatListTypes';
import type { ChatsFilterType } from './chatListFeedStore';

export function useChatListMarketDrawer(
  chatsFilter: ChatsFilterType,
  marketChatRole: 'buyer' | 'seller',
  displayedChats: ChatItem[]
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const itemIdFromUrl = searchParams.get('item');
  const [selectedMarketItemForDrawer, setSelectedMarketItemForDrawer] = useState<MarketItem | null>(null);

  const marketGroupedByItem = useMemo(() => {
    if (chatsFilter !== 'market' || marketChatRole !== 'seller') return null;
    const map = new Map<
      string,
      { itemId: string; title: string; thumb?: string; marketItem?: MarketItem; channels: ChatItem[] }
    >();
    displayedChats.forEach((c) => {
      if (c.type !== 'channel' || !('marketItemId' in c.data) || !c.data.marketItemId) return;
      const key = c.data.marketItemId;
      const gc = c.data as GroupChannel;
      if (!map.has(key)) {
        map.set(key, {
          itemId: key,
          title: gc.marketItem?.title ?? '',
          thumb: gc.marketItem?.mediaUrls?.[0],
          marketItem: gc.marketItem,
          channels: [],
        });
      }
      map.get(key)!.channels.push(c);
    });
    return Array.from(map.values()).sort((a, b) => {
      const channelTime = (ch: (typeof a.channels)[number]) =>
        ch.lastMessageDate
          ? ch.lastMessageDate.getTime()
          : new Date((ch as Extract<(typeof a.channels)[number], { type: 'channel' }>).data.updatedAt).getTime();
      const aMax = Math.max(...a.channels.map(channelTime));
      const bMax = Math.max(...b.channels.map(channelTime));
      return bMax - aMax;
    });
  }, [chatsFilter, marketChatRole, displayedChats]);

  const openMarketItemDrawer = useCallback(
    (item: MarketItem) => {
      setSelectedMarketItemForDrawer(item);
      setSearchParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set('item', item.id);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const closeMarketItemDrawer = useCallback(() => {
    setSelectedMarketItemForDrawer(null);
    setSearchParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('item');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const handleMarketItemGroupClick = useCallback(
    async (group: { itemId: string; marketItem?: MarketItem }) => {
      if (group.marketItem) {
        openMarketItemDrawer(group.marketItem);
        return;
      }
      try {
        const res = await marketplaceApi.getMarketItemById(group.itemId);
        openMarketItemDrawer(res.data);
      } catch {
        setSelectedMarketItemForDrawer(null);
      }
    },
    [openMarketItemDrawer]
  );

  useEffect(() => {
    if (chatsFilter !== 'market' || !itemIdFromUrl) {
      if (!itemIdFromUrl) setSelectedMarketItemForDrawer(null);
      return;
    }
    if (selectedMarketItemForDrawer?.id === itemIdFromUrl) return;
    let cancelled = false;
    marketplaceApi
      .getMarketItemById(itemIdFromUrl)
      .then((res) => {
        if (!cancelled) setSelectedMarketItemForDrawer(res.data);
      })
      .catch(() => {
        if (!cancelled)
          setSearchParams(
            (p) => {
              const n = new URLSearchParams(p);
              n.delete('item');
              return n;
            },
            { replace: true }
          );
      });
    return () => {
      cancelled = true;
    };
  }, [chatsFilter, itemIdFromUrl, selectedMarketItemForDrawer?.id, setSearchParams]);

  return {
    marketGroupedByItem,
    selectedMarketItemForDrawer,
    closeMarketItemDrawer,
    handleMarketItemGroupClick,
  };
}
