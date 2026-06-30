import type { ChatContextType } from '@/api/chat';
import { contextKey, type SnapshotContextType } from '@/services/chat/unreadSnapshot';
import {
  CHAT_MUTATION_FLUSH_FAILED_EVENT,
  type ChatMutationFlushFailedDetail,
} from '@/services/chat/chatMutationEvents';
import { onMarkReadBatchFlushFailure } from '@/services/chat/unreadCoordinator';

const MARK_READ_FLUSH_KIND = 'mark_read_batch';
const RESYNC_FLUSH_CONTEXTS: readonly ChatContextType[] = ['USER', 'GROUP', 'GAME'];

function snapshotTypeFromChatContext(contextType: ChatContextType): SnapshotContextType | null {
  if (contextType === 'GAME' || contextType === 'USER' || contextType === 'GROUP') return contextType;
  return null;
}

let markReadFlushResyncInstalled = false;

export function installMarkReadFlushFailureResync(): void {
  if (typeof window === 'undefined' || markReadFlushResyncInstalled) return;
  markReadFlushResyncInstalled = true;
  window.addEventListener(CHAT_MUTATION_FLUSH_FAILED_EVENT, (ev: Event) => {
    const d = (ev as CustomEvent<ChatMutationFlushFailedDetail>).detail;
    if (!d || d.kind !== MARK_READ_FLUSH_KIND || !d.contextId) return;
    if (!RESYNC_FLUSH_CONTEXTS.includes(d.contextType as ChatContextType)) return;
    const snapshotType = snapshotTypeFromChatContext(d.contextType as ChatContextType);
    if (!snapshotType) return;
    onMarkReadBatchFlushFailure(contextKey(snapshotType, d.contextId));
  });
}
