import type { TFunction } from 'i18next';
import type { ChatContextType } from '@/api/chat';
import {
  CHAT_OUTBOX_REMOVED_EVENT,
  type ChatOutboxRemovedDetail,
} from '@/services/chat/chatOutboxEvents';
import {
  formatArchivedOutboxFeedback,
  getArchivedOutboxDropCount,
} from './archivedOutboxFeedback';

export function subscribeArchivedOutboxFeedback(params: {
  contextType: ChatContextType;
  contextId: string | undefined;
  t: TFunction;
  onFeedback: (message: string) => void;
}): () => void {
  const { contextType, contextId, t, onFeedback } = params;

  const onOutboxRemoved = (event: Event) => {
    const detail = (event as CustomEvent<ChatOutboxRemovedDetail>).detail;
    const droppedCount = getArchivedOutboxDropCount(detail, contextType, contextId);
    if (droppedCount <= 0) return;
    onFeedback(formatArchivedOutboxFeedback(t, droppedCount));
  };

  window.addEventListener(CHAT_OUTBOX_REMOVED_EVENT, onOutboxRemoved);
  return () => {
    window.removeEventListener(CHAT_OUTBOX_REMOVED_EVENT, onOutboxRemoved);
  };
}
