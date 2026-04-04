import { useCallback, useEffect, useState } from 'react';
import type { ChatContextType } from '@/api/chat';
import { countFailedMutationsForContext } from '@/services/chat/chatMutationQueueStorage';
import {
  CHAT_MUTATION_FLUSH_DONE_EVENT,
  CHAT_MUTATION_FLUSH_FAILED_EVENT,
} from '@/services/chat/chatMutationEvents';
import { flushAllChatOfflineQueues } from '@/services/chat/chatUnifiedOfflineFlush';
import { useNetworkStore } from '@/utils/networkStatus';

export function useGameChatMutationRetry(contextType: ChatContextType, contextId: string | undefined) {
  const [failedCount, setFailedCount] = useState(0);
  const netOnline = useNetworkStore((s) => s.isOnline);

  const refresh = useCallback(async () => {
    if (!contextId) {
      setFailedCount(0);
      return;
    }
    const n = await countFailedMutationsForContext(contextType, contextId);
    setFailedCount(n);
  }, [contextType, contextId]);

  useEffect(() => {
    void refresh();
  }, [refresh, netOnline]);

  useEffect(() => {
    const onFail = (ev: Event) => {
      const d = (ev as CustomEvent<{ contextType?: string; contextId?: string }>).detail;
      if (d?.contextType === contextType && d?.contextId === contextId) void refresh();
    };
    const onDone = () => void refresh();
    window.addEventListener(CHAT_MUTATION_FLUSH_FAILED_EVENT, onFail);
    window.addEventListener(CHAT_MUTATION_FLUSH_DONE_EVENT, onDone);
    return () => {
      window.removeEventListener(CHAT_MUTATION_FLUSH_FAILED_EVENT, onFail);
      window.removeEventListener(CHAT_MUTATION_FLUSH_DONE_EVENT, onDone);
    };
  }, [contextType, contextId, refresh]);

  const retryMutations = useCallback(() => {
    void flushAllChatOfflineQueues().finally(() => void refresh());
  }, [refresh]);

  return { failedMutationCount: failedCount, retryMutations, refreshMutationFailureCount: refresh };
}
