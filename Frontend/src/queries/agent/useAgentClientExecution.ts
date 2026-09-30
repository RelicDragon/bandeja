import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';
import { gameIdsFromEntities, invalidateTouchedGames, patchAgentChatDetail, upsertAction } from '@/features/agent/agentCache';
import { useAgentRunStore } from '@/features/agent/agentRunStore';
import {
  resumeAgentClientAttempts,
  runAgentClientAction,
  type AgentClientExecutorDeps,
  type AgentClientRunResult,
} from '@/features/agent/agentClientExecutor';
import { awaitAgentClientPriceAnswer, useAgentClientExecStore } from '@/features/agent/agentClientExecStore';

/**
 * Apply a client-execution outcome to the chat cache — same pattern as confirm / reject:
 * upsert the settled action, start tracking the follow-up run, refetch the chat (outcome
 * appended to the tool step) and the list row.
 */
export function applyAgentClientResult(
  queryClient: QueryClient,
  chatId: string,
  result: AgentClientRunResult,
  userId?: string,
): void {
  if (result.kind === 'reported' || result.kind === 'not_claimed') {
    const { action, runId } = result;
    patchAgentChatDetail(queryClient, chatId, (d) => {
      const next = upsertAction(d, action);
      return runId ? { ...next, activeRun: { id: runId, status: 'QUEUED' } } : next;
    });
    useAgentRunStore.getState().dispatch(action.runId, { type: 'actionHandled', action });
    const wrote = action.status === 'EXECUTED';
    invalidateTouchedGames(queryClient, gameIdsFromEntities(action.result?.entities), { wrote, userId });
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chats() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) });
}

function localStateFor(result: AgentClientRunResult) {
  switch (result.kind) {
    case 'reported':
      return { stage: 'finished', notConnected: result.notConnected, leaseExpired: result.leaseExpired } as const;
    case 'handled':
      return { stage: 'handled' } as const;
    case 'interrupted':
      return { stage: 'interrupted' } as const;
    case 'report_pending':
      return { stage: 'report_pending' } as const;
    case 'not_claimed':
      return null;
  }
}

/** "Book in app" / "Cancel in app": claim → adapter → report, progress in `agentClientExecStore`. */
export function useAgentClientExecution(chatId: string, deps?: AgentClientExecutorDeps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  return useCallback(
    async (actionId: string) => {
      const setState = useAgentClientExecStore.getState().set;
      setState(actionId, { stage: 'progress', progress: { kind: 'claiming' } });
      try {
        const result = await runAgentClientAction(
          {
            actionId,
            chatId,
            onProgress: (progress) => setState(actionId, { stage: 'progress', progress }),
            confirmPrice: async (quote) => {
              const ok = await awaitAgentClientPriceAnswer(actionId, quote);
              if (ok) setState(actionId, { stage: 'progress', progress: { kind: 'rechecking' } });
              return ok;
            },
          },
          deps,
        );
        setState(actionId, localStateFor(result));
        applyAgentClientResult(queryClient, chatId, result, userId);
      } catch (err) {
        setState(actionId, { stage: 'error', message: extractApiErrorMessage(err, t) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) });
      }
    },
    [chatId, deps, queryClient, t, userId],
  );
}

/**
 * Re-report stored attempts on chat open and whenever the app comes back to the foreground
 * (booking plan §14.5 step 6). Safe to run while an action executes: those are skipped.
 */
export function useAgentClientResume(deps?: AgentClientExecutorDeps): void {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    // Results apply even after unmount: the query cache outlives the view.
    const resume = () => {
      void resumeAgentClientAttempts(deps).then((done) => {
        for (const { chatId, result } of done) applyAgentClientResult(queryClient, chatId, result, userId);
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') resume();
    };
    resume();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [deps, queryClient, userId]);
}
