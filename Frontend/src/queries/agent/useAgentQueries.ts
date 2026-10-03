import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { AgentChatDetailDto, AgentChatDto, AgentPendingActionDto } from '@shared/agentContract';
import { agentApi, type AgentChatListData } from '@/api/agent';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { agentChatsPollingOptions, finishedAgentRuns } from '@/features/agent/agentChatsPolling';
import { useAgentRunStore } from '@/features/agent/agentRunStore';
import {
  expirePendingActions,
  gameIdsFromEntities,
  invalidateTouchedGames,
  patchAgentChatDetail,
  truncateMessagesFrom,
  upsertAction,
  upsertMessage,
} from '@/features/agent/agentCache';
import { withAgentChatPinned, withoutAgentChat, type AgentChatListView } from '@/features/agent/agentChatOrder';

/**
 * AI chat list (`view`: main or Archived). Polls every ~5s while a row has a QUEUED/RUNNING run
 * so the row indicator stays live, and refetches a chat's detail (plus the games its run
 * touched, when this device streamed it) once the list sees that run end.
 */
export function useAgentChatsQuery(view: AgentChatListView = 'main', enabled = true) {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const query = useQuery<AgentChatListData>({
    queryKey: queryKeys.agent.chats(userId ?? 'anon', view),
    queryFn: () => agentApi.listChats({ archived: view === 'archived' }),
    enabled: enabled && Boolean(userId),
    ...agentChatsPollingOptions,
  });

  const prevRef = useRef<AgentChatDto[] | undefined>(undefined);
  const data = query.data?.chats;
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

/** Optimistic: the row jumps into its pinned / unpinned place before the server answers. */
export function useSetAgentChatPinnedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, pinned }: { chatId: string; pinned: boolean }) => agentApi.setChatPinned(chatId, pinned),
    onMutate: async ({ chatId, pinned }) => {
      const snapshots = await patchChatLists(queryClient, (list) => ({
        ...list,
        chats: withAgentChatPinned(list.chats, chatId, pinned),
      }));
      patchAgentChatDetail(queryClient, chatId, (d) => ({ ...d, pinnedAt: pinned ? new Date().toISOString() : null }));
      return { snapshots };
    },
    onError: (_err, { chatId }, ctx) => {
      restoreChatLists(queryClient, ctx?.snapshots);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) });
    },
    onSuccess: (chat, { chatId }) => {
      patchAgentChatDetail(queryClient, chatId, (d) => ({ ...d, pinnedAt: chat.pinnedAt ?? null }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chats() });
    },
  });
}

/** Archive / unarchive. Optimistic: the row leaves its list and the Archived count follows. */
export function useSetAgentChatArchivedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, archived }: { chatId: string; archived: boolean }) =>
      agentApi.setChatArchived(chatId, archived),
    onMutate: async ({ chatId, archived }) => {
      const snapshots = await patchChatLists(queryClient, (list) =>
        withoutAgentChat(list, chatId, archived ? 1 : -1),
      );
      patchAgentChatDetail(queryClient, chatId, (d) => ({
        ...d,
        archivedAt: archived ? new Date().toISOString() : null,
      }));
      return { snapshots };
    },
    onError: (_err, { chatId }, ctx) => {
      restoreChatLists(queryClient, ctx?.snapshots);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chats() });
    },
  });
}

/** Soft delete: the chat leaves every list for good (the server keeps it). */
export function useDeleteAgentChatMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId }: { chatId: string; archived: boolean }) => agentApi.deleteChat(chatId),
    onSuccess: (_data, { chatId, archived }) => {
      queryClient.setQueriesData<AgentChatListData>({ queryKey: queryKeys.agent.chats() }, (prev) =>
        prev ? withoutAgentChat(prev, chatId, archived ? -1 : 0) : prev,
      );
      queryClient.removeQueries({ queryKey: queryKeys.agent.chat(chatId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chats() });
    },
  });
}

type ChatListSnapshots = Array<[QueryKey, AgentChatListData | undefined]>;

async function patchChatLists(
  client: QueryClient,
  patch: (list: AgentChatListData) => AgentChatListData,
): Promise<ChatListSnapshots> {
  await client.cancelQueries({ queryKey: queryKeys.agent.chats() });
  const snapshots = client.getQueriesData<AgentChatListData>({ queryKey: queryKeys.agent.chats() });
  client.setQueriesData<AgentChatListData>({ queryKey: queryKeys.agent.chats() }, (prev) =>
    prev ? patch(prev) : prev,
  );
  return snapshots;
}

function restoreChatLists(client: QueryClient, snapshots: ChatListSnapshots | undefined) {
  for (const [key, data] of snapshots ?? []) client.setQueryData(key, data);
}

/** `edit`: resend in place of that USER message (it and everything after it are dropped). */
export type AgentSendVars = { text: string; edit?: { messageId: string; seq: number }; voice?: boolean };

export function useSendAgentMessageMutation(chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: AgentSendVars) => agentApi.sendMessage(chatId, vars.text, vars.edit?.messageId, vars.voice),
    onSuccess: ({ message, runId }, vars) => {
      patchAgentChatDetail(queryClient, chatId, (d) => ({
        ...expirePendingActions(upsertMessage(vars.edit ? truncateMessagesFrom(d, vars.edit.seq) : d, message)),
        // Runs start QUEUED; `run.queued` / `run.started` move the view on from there.
        activeRun: { id: runId, status: 'QUEUED' },
        // The server moves an archived chat back to the main list on send.
        archivedAt: null,
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
