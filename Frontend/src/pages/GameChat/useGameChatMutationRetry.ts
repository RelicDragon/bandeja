import { useCallback, useEffect, useState } from 'react';
import type { ChatContextType } from '@/api/chat';
import { countFailedMutationsForContext } from '@/services/chat/chatMutationQueueStorage';
import { countFailedOutboxForContext } from '@/services/chat/offlineIntent/outboxAdapter';
import { flushAllChatOfflineQueues } from '@/services/chat/chatUnifiedOfflineFlush';
import { useNetworkStore } from '@/utils/networkStatus';
import { subscribeMutationRetryRefresh } from './mutationRetryRefreshSubscription';

export function useGameChatMutationRetry(contextType: ChatContextType, contextId: string | undefined) {
  const [failedCount, setFailedCount] = useState(0);
  const netOnline = useNetworkStore((s) => s.isOnline);

  const refresh = useCallback(async () => {
    if (!contextId) {
      setFailedCount(0);
      return;
    }
    const [mutations, sends] = await Promise.all([
      countFailedMutationsForContext(contextType, contextId),
      countFailedOutboxForContext(contextType, contextId),
    ]);
    setFailedCount(mutations + sends);
  }, [contextType, contextId]);

  useEffect(() => {
    void refresh();
  }, [refresh, netOnline]);

  useEffect(() => {
    return subscribeMutationRetryRefresh({
      contextType,
      contextId,
      refresh: () => void refresh(),
    });
  }, [contextType, contextId, refresh]);

  const retryMutations = useCallback(() => {
    void flushAllChatOfflineQueues().finally(() => void refresh());
  }, [refresh]);

  return { failedMutationCount: failedCount, retryMutations, refreshMutationFailureCount: refresh };
}
