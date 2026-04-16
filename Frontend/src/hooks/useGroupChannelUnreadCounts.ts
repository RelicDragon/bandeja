import { useState, useEffect, useCallback, useRef } from 'react';
import { chatApi } from '@/api/chat';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useNavigationStore } from '@/store/navigationStore';
import { patchThreadIndexSetUnreadCount } from '@/services/chat/chatThreadIndex';
import { RESTORE_GROUP_UNREAD_EVENT } from '@/services/chat/applyOptimisticMarkContextRead';

export const useGroupChannelUnreadCounts = (channelIds: string[]): Record<string, number> => {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const groupUnreadSeq = useSocketEventsStore((state) => state.groupUnreadSeq);
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
      for (const id of ids) {
        const n = id === viewing ? 0 : merged[id] ?? 0;
        void patchThreadIndexSetUnreadCount('GROUP', id, n);
      }
    } catch {
      if (runId !== fetchRunRef.current) return;
    }
  }, []);

  useEffect(() => {
    fetchCounts(channelIdsRef.current);
  }, [fetchCounts, channelIdsKey]);

  useEffect(() => {
    const onClear = (ev: Event) => {
      const d = (ev as CustomEvent<{ contextType?: string; contextId?: string }>).detail;
      const contextId = d?.contextType === 'GROUP' ? d.contextId : undefined;
      if (!contextId) return;
      if (!channelIdsRef.current.includes(contextId)) return;
      setUnreadCounts((prev) => ({ ...prev, [contextId]: 0 }));
      void patchThreadIndexSetUnreadCount('GROUP', contextId, 0);
    };
    const onRestore = (ev: Event) => {
      const d = (ev as CustomEvent<{ channelId?: string; unreadCount?: number }>).detail;
      const channelId = d?.channelId;
      const unreadCount = d?.unreadCount;
      if (!channelId || unreadCount == null) return;
      if (!channelIdsRef.current.includes(channelId)) return;
      setUnreadCounts((prev) => ({ ...prev, [channelId]: unreadCount }));
      void patchThreadIndexSetUnreadCount('GROUP', channelId, unreadCount);
    };
    window.addEventListener('chat-viewing-clear-unread', onClear);
    window.addEventListener(RESTORE_GROUP_UNREAD_EVENT, onRestore);
    return () => {
      window.removeEventListener('chat-viewing-clear-unread', onClear);
      window.removeEventListener(RESTORE_GROUP_UNREAD_EVENT, onRestore);
    };
  }, []);

  useEffect(() => {
    const batch = useSocketEventsStore.getState().takeGroupUnreadInbound();
    for (const item of batch) {
      if (item.contextType !== 'GROUP') continue;
      const { contextId, unreadCount } = item;
      if (channelIdsRef.current.includes(contextId)) {
        const viewing = useNavigationStore.getState().viewingGroupChannelId;
        const next = contextId === viewing ? 0 : unreadCount;
        setUnreadCounts((prev) => ({ ...prev, [contextId]: next }));
        void patchThreadIndexSetUnreadCount('GROUP', contextId, next);
      }
    }
  }, [groupUnreadSeq]);

  if (viewingGroupChannelId && channelIds.includes(viewingGroupChannelId)) {
    return { ...unreadCounts, [viewingGroupChannelId]: 0 };
  }
  return unreadCounts;
};
