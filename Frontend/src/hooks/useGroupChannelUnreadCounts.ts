import { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi } from '@/api/chat';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useNavigationStore } from '@/store/navigationStore';

export const useGroupChannelUnreadCounts = (channelIds: string[]): Record<string, number> => {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const lastChatUnreadCount = useSocketEventsStore((state) => state.lastChatUnreadCount);
  const viewingGroupChannelId = useNavigationStore((state) => state.viewingGroupChannelId);
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
      const data = res.data || {};
      const viewing = useNavigationStore.getState().viewingGroupChannelId;
      const merged = { ...data };
      if (viewing && ids.includes(viewing)) merged[viewing] = 0;
      setUnreadCounts(merged);
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
      const viewing = useNavigationStore.getState().viewingGroupChannelId;
      setUnreadCounts((prev) => ({ ...prev, [contextId]: contextId === viewing ? 0 : unreadCount }));
    }
  }, [lastChatUnreadCount]);

  if (viewingGroupChannelId && channelIds.includes(viewingGroupChannelId)) {
    return { ...unreadCounts, [viewingGroupChannelId]: 0 };
  }
  return unreadCounts;
};
