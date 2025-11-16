import { useState, useEffect, useCallback, useRef } from 'react';
import { bugsApi } from '@/api';
import { chatApi } from '@/api/chat';
import { Bug } from '@/types';
import { useHeaderStore } from '@/store/headerStore';

export const useBugsWithUnread = (user: any) => {
  const [bugsWithUnread, setBugsWithUnread] = useState<Bug[]>([]);
  const [bugsUnreadCounts, setBugsUnreadCounts] = useState<Record<string, number>>({});
  const showChatFilter = useHeaderStore((state) => state.showChatFilter);
  const isLoadingUnreadBugsRef = useRef(false);

  const loadAllBugsWithUnread = useCallback(async () => {
    if (!user?.id || isLoadingUnreadBugsRef.current) return;

    isLoadingUnreadBugsRef.current = true;
    try {
      // Load all bugs (no filter) since users can now participate in any bug
      const response = await bugsApi.getBugs({
        page: 1,
        limit: 100,
      });

      if (response.data.bugs.length === 0) {
        isLoadingUnreadBugsRef.current = false;
        setBugsWithUnread([]);
        return;
      }

      const bugIds = response.data.bugs.map(bug => bug.id);
      const unreadResponse = await chatApi.getBugsUnreadCounts(bugIds);
      
      const bugsWithUnreadMessages = response.data.bugs.filter(
        bug => (unreadResponse.data[bug.id] || 0) > 0
      );

      setBugsWithUnread(bugsWithUnreadMessages);
      setBugsUnreadCounts(unreadResponse.data);
    } catch (error) {
      console.error('Failed to load bugs with unread messages:', error);
    } finally {
      isLoadingUnreadBugsRef.current = false;
    }
  }, [user?.id]);

  useEffect(() => {
    if (showChatFilter && user?.id) {
      loadAllBugsWithUnread();
    } else {
      setBugsWithUnread([]);
      setBugsUnreadCounts({});
    }
  }, [showChatFilter, user?.id, loadAllBugsWithUnread]);

  return {
    bugsWithUnread,
    bugsUnreadCounts,
    loadAllBugsWithUnread,
  };
};

