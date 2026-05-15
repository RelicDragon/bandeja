import { useSyncExternalStore } from 'react';
import {
  getChatMediaDownloadIdleState,
  getChatMediaDownloadState,
  subscribeChatMediaDownload,
} from '@/services/chat/chatMediaDownloadManager';

export function useChatMediaDownload(url: string | undefined) {
  const key = url ?? '';
  const subscribe = (onStoreChange: () => void) =>
    key ? subscribeChatMediaDownload(key, onStoreChange) : () => {};
  const getSnapshot = () =>
    key ? getChatMediaDownloadState(key) : getChatMediaDownloadIdleState();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
