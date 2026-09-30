import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AgentChatDetailDto, AgentChatDto, AgentPendingActionDto } from '@shared/agentContract';
import { agentApi } from '@/api/agent';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { agentChatsPollingOptions, finishedAgentRuns } from '@/features/agent/agentChatsPolling';
import { useAgentRunStore } from '@/features/agent/agentRunStore';
import {
  expirePendingActions,
  gameIdsFromEntities,
  invalidateTouchedGames,
  patchAgentChatDetail,
  upsertAction,
  upsertMessage,
} from '@/features/agent/agentCache';

/**
 * AI chat list. Polls every ~5s while a row has a QUEUED/RUNNING run so the row indicator
 * stays live, and refetches a chat's detail (plus the games its run touched, when this
 * device streamed it) once the list sees that run end.
 */
export function useAgentChatsQuery(enabled = true) {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const query = useQuery<AgentChatDto[]>({
    queryKey: queryKeys.agent.chats(userId ?? 'anon'),
    queryFn: () => agentApi.listChats(),
    enabled: enabled && Boolean(userId),
    ...agentChatsPollingOptions,
  });

  const prevRef = useRef<AgentChatDto[] | undefined>(undefined);
  const data = query.data;
  useEffect(() => {
    const finished = finishedAgentRuns(prevRef.current, data);
    prevRef.current = data;
    if (finished.length === 0) return;
    const runs = useAgentRunStore.getState().runs;
    const touched = finished.flatMap((f) => runs[f.runId]?.touchedEntities ?? []);
    invalidateTouchedGames(queryClient, gameIdsFromEntities(touched), { wrote: false, userId });
    for (const f of finished) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(f.chatId) });
    }
  }, [data, queryClient, userId]);

  return query;
}

export function useAgentChatQuery(chatId: string | null) {
  return useQuery<AgentChatDetailDto>({
    queryKey: queryKeys.agent.chat(chatId ?? 'none'),
    queryFn: () => agentApi.getChat(chatId as string),
    enabled: Boolean(chatId),
    staleTime: 0,
  });
}

function useInvalidateChats() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.agent.chats() });
}

export function useCreateAgentChatMutation() {
  const invalidateChats = useInvalidateChats();
  return useMutation({
    mutationFn: () => agentApi.createChat(),
    onSuccess: () => {
      void invalidateChats();
    },
  });
}

export function useRenameAgentChatMutation() {
  const queryClient = useQueryClient();
  const invalidateChats = useInvalidateChats();
  return useMutation({
    mutationFn: ({ chatId, title }: { chatId: string; title: string }) => agentApi.renameChat(chatId, title),
    onSuccess: (chat, { chatId }) => {
      patchAgentChatDetail(queryClient, chatId, (d) => ({ ...d, title: chat.title }));
      void invalidateChats();
    },
  });
}

export function useArchiveAgentChatMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) => agentApi.archiveChat(chatId),
    onSuccess: (_data, chatId) => {
      queryClient.setQueriesData<AgentChatDto[]>({ queryKey: queryKeys.agent.chats() }, (prev) =>
        prev ? prev.filter((c) => c.id !== chatId) : prev,
      );
      queryClient.removeQueries({ queryKey: queryKeys.agent.chat(chatId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chats() });
    },
  });
}

export function useSendAgentMessageMutation(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => agentApi.sendMessage(chatId, text),
    onSuccess: ({ message, runId }) => {
      patchAgentChatDetail(queryClient, chatId, (d) => ({
        ...expirePendingActions(upsertMessage(d, message)),
        // Runs start QUEUED; `run.queued` / `run.started` move the view on from there.
        activeRun: { id: runId, status: 'QUEUED' },
      }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chats() });
    },
  });
}

/** Works for QUEUED and RUNNING runs; the stream then delivers `run.cancelled`. */
export function useCancelAgentRunMutation() {
  const invalidateChats = useInvalidateChats();
  return useMutation({
    mutationFn: (runId: string) => agentApi.cancelRun(runId),
    onSuccess: () => {
      void invalidateChats();
    },
  });
}

/**
 * After Confirm / Cancel: the paused run is over server-side (no PENDING action left), so drop
 * its local AWAITING_CONFIRMATION state and refresh the list row ("Needs your OK").
 */
function settleHandledAction(queryClient: QueryClient, action: AgentPendingActionDto): void {
  useAgentRunStore.getState().dispatch(action.runId, { type: 'actionHandled', action });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chats() });
}

/** An action id ("Allow once"), or `{ actionId, remember: 'always' }` ("Always allow", plan §15). */
export type ConfirmAgentActionVars = string | { actionId: string; remember: 'always' };

export function confirmVarsActionId(vars: ConfirmAgentActionVars | undefined): string | undefined {
  return typeof vars === 'string' ? vars : vars?.actionId;
}

export function useConfirmAgentActionMutation(chatId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (vars: ConfirmAgentActionVars) =>
      typeof vars === 'string'
        ? agentApi.confirmAction(vars)
        : agentApi.confirmAction(vars.actionId, { remember: vars.remember }),
    onSuccess: ({ action, runId }, vars) => {
      // "Always allow" stored ALWAYS_ALLOW server-side: the permissions screen must refetch.
      if (typeof vars !== 'string') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.agent.permissions() });
      }
      patchAgentChatDetail(queryClient, chatId, (d) => {
        const next = upsertAction(d, action);
        return runId ? { ...next, activeRun: { id: runId, status: 'QUEUED' } } : next;
      });
      settleHandledAction(queryClient, action);
      const wrote = action.status === 'EXECUTED' || action.status === 'CONFIRMED';
      invalidateTouchedGames(queryClient, gameIdsFromEntities(action.result?.entities), {
        wrote,
        userId,
      });
      // The outcome is already appended to the tool step; a follow-up run (if any) is in the
      // refetched `activeRun` too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) });
    },
    onError: () => {
      // Expired / already handled server-side: show the authoritative state.
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) });
    },
  });
}

export function useRejectAgentActionMutation(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) => agentApi.rejectAction(actionId),
    onSuccess: ({ action }) => {
      patchAgentChatDetail(queryClient, chatId, (d) => upsertAction(d, action));
      settleHandledAction(queryClient, action);
      // The server appended the `declined_by_user` outcome to the tool step: refetch it.
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) });
    },
  });
}
