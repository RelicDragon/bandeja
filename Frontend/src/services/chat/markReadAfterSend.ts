import type { ChatContextType } from '@/api/chat';
import type { SnapshotContextType } from '@/services/chat/unreadSnapshot';
import { markContextReadOnUserActivity } from '@/services/chat/unreadCoordinator';

/** Client mark-read after send (debounced). Backend also marks on createMessage. */
export function markReadAfterSend(
  contextType: ChatContextType,
  contextId: string,
  groupChannelId?: string
): void {
  if (contextType === 'GAME' || contextType === 'USER' || contextType === 'GROUP') {
    markContextReadOnUserActivity({
      contextType: contextType as SnapshotContextType,
      contextId,
      rawContextType: contextType,
    });
    return;
  }
  if (contextType === 'BUG') {
    markContextReadOnUserActivity({
      contextType: 'GROUP',
      contextId,
      rawContextType: 'BUG',
      groupChannelId,
    });
  }
}
