import { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi } from '@/api/chat';
import { useSocketEventsStore } from '@/store/socketEventsStore';

export const useGroupChannelUnreadCounts = (channelIds: string[]): Record<string, number> => {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const lastChatUnreadCount = useSocketEventsStore((state) => state.lastChatUnreadCount);
  const channelIdsKey = channelIds.length ? channelIds.slice().sort().join(',') : '';
  const channelIdsRef = useRef(channelIds);
  channelIdsRef.current = channelIds;

  const fetchCounts = useCallback(async () => {
    const ids = channelIdsRef.current;
    if (ids.length === 0) {
      setUnreadCounts({});
      return;
    }
    try {
      const res = await chatApi.getGroupChannelsUnreadCounts(ids);
      setUnreadCounts(res.data || {});
    } catch {
      // keep previous state
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- channelIdsKey triggers refetch when channel list changes
  }, [channelIdsKey]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    if (!lastChatUnreadCount || lastChatUnreadCount.contextType !== 'GROUP') return;
    const { contextId, unreadCount } = lastChatUnreadCount;
    if (channelIdsRef.current.includes(contextId)) {
      setUnreadCounts((prev) => ({ ...prev, [contextId]: unreadCount }));
    }
  }, [lastChatUnreadCount]);

  return unreadCounts;
};
