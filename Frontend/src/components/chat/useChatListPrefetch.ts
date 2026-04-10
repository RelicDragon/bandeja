import { useEffect, type MutableRefObject } from 'react';
import { getChatKey } from '@/utils/chatListHelpers';
import { prefetchTopChatsSync } from '@/services/chat/chatPrefetch';
import type { ChatItem } from './chatListTypes';

export function useChatListPrefetch(
  userId: string | undefined,
  isOnline: boolean,
  chatsRef: MutableRefObject<ChatItem[]>
) {
  const list = chatsRef.current;
  const keys = list.slice(0, 18).map((c) => getChatKey(c));
  keys.sort();
  const prefetchSignature = keys.join('\0');

  useEffect(() => {
    if (!userId || !isOnline || prefetchSignature.length === 0) return;
    const t = window.setTimeout(() => prefetchTopChatsSync(chatsRef.current), 450);
    return () => window.clearTimeout(t);
  }, [userId, isOnline, prefetchSignature, chatsRef]);
}
