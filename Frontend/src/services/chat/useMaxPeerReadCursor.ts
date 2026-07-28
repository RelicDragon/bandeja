import { useSyncExternalStore } from 'react';
import type { ChatContextType, ChatType } from '@/api/chat';
import type { MaxPeerReadCursor } from './peerReadCursor';
import {
  getMaxPeerReadCursor,
  peerReadCursorStoreGetSnapshot,
  peerReadCursorStoreSubscribe,
} from './peerReadCursorStore';

export function useMaxPeerReadCursor(
  chatContextType: ChatContextType | string | undefined,
  contextId: string | undefined,
  chatType: ChatType | string | undefined
): MaxPeerReadCursor | null {
  const version = useSyncExternalStore(
    peerReadCursorStoreSubscribe,
    peerReadCursorStoreGetSnapshot,
    peerReadCursorStoreGetSnapshot
  );
  if (!chatContextType || !contextId || !chatType) return null;
  void version;
  return getMaxPeerReadCursor(chatContextType, contextId, chatType);
}
