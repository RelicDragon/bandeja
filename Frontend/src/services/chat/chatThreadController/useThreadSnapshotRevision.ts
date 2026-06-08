import { useSyncExternalStore } from 'react';
import type { ChatContextType } from '@/api/chat';
import {
  getThreadSnapshotRevision,
  subscribeThreadSnapshotRevision,
} from '@/services/chat/chatLocalApply';

export function useThreadSnapshotRevision(
  contextType: ChatContextType,
  contextId: string | undefined
): number {
  return useSyncExternalStore(
    (onStoreChange) =>
      contextId
        ? subscribeThreadSnapshotRevision(contextType, contextId, onStoreChange)
        : () => {},
    () => (contextId ? getThreadSnapshotRevision(contextType, contextId) : 0),
    () => 0
  );
}
