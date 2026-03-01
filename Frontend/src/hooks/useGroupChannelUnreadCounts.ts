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
  const fetchRunRef = useRef(0);

  const fetchCounts = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setUnreadCounts({});
      return;
    }
    const runId = ++fetchRunRef.current;
    try {
      const res = await chatApi.getGroupChannelsUnreadCounts(ids);
      if (runId !== fetchRunRef.current) return;
      const data = res.data || {};
      const viewing = useNavigationStore.getState().viewingGroupChannelId;
      const merged = { ...data };
      if (viewing && ids.includes(viewing)) merged[viewing] = 0;
      setUnreadCounts(merged);
    } catch {
      if (runId !== fetchRunRef.current) return;
    }
  }, []);

  useEffect(() => {
    fetchCounts(channelIdsRef.current);
  }, [fetchCounts, channelIdsKey]);

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
