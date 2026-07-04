import type { ChatContextType } from '@/api/chat';
import {
  CHAT_MUTATION_FLUSH_DONE_EVENT,
  CHAT_MUTATION_FLUSH_FAILED_EVENT,
} from '@/services/chat/chatMutationEvents';
import {
  CHAT_OUTBOX_FAILED_EVENT,
  CHAT_OUTBOX_REMOVED_EVENT,
} from '@/services/chat/chatOutboxEvents';

export function subscribeMutationRetryRefresh(params: {
  contextType: ChatContextType;
  contextId: string | undefined;
  refresh: () => void | Promise<void>;
}): () => void {
  const { contextType, contextId, refresh } = params;

  const onFail = (ev: Event) => {
    const detail = (ev as CustomEvent<{ contextType?: string; contextId?: string }>).detail;
    if (detail?.contextType === contextType && detail?.contextId === contextId) void refresh();
  };
  const onDone = () => void refresh();

  window.addEventListener(CHAT_MUTATION_FLUSH_FAILED_EVENT, onFail);
  window.addEventListener(CHAT_OUTBOX_FAILED_EVENT, onFail);
  window.addEventListener(CHAT_OUTBOX_REMOVED_EVENT, onDone);
  window.addEventListener(CHAT_MUTATION_FLUSH_DONE_EVENT, onDone);

  return () => {
    window.removeEventListener(CHAT_MUTATION_FLUSH_FAILED_EVENT, onFail);
    window.removeEventListener(CHAT_OUTBOX_FAILED_EVENT, onFail);
    window.removeEventListener(CHAT_OUTBOX_REMOVED_EVENT, onDone);
    window.removeEventListener(CHAT_MUTATION_FLUSH_DONE_EVENT, onDone);
  };
}
