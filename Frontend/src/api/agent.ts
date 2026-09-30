import api from './axios';
import type { ApiResponse } from '@/types';
import {
  AGENT_CLIENT_CAPS_HEADER,
  type AgentChatDetailDto,
  type AgentClientClaimResponse,
  type AgentClientReportRequest,
  type AgentChatDto,
  type AgentMessageDto,
  type AgentPendingActionDto,
  type AgentToolPermissionDto,
  type AgentToolPermissionMode,
} from '@shared/agentContract';

/**
 * Every agent request says what this build can run in the app (booking plan §14.5): the
 * server stores it on the run, so tools may propose client-executed bookings.
 */
export const AGENT_CLIENT_CAPS = 'booking-v1';
const caps = { headers: { [AGENT_CLIENT_CAPS_HEADER]: AGENT_CLIENT_CAPS } };

/**
 * AI agent chats (docs/plans/ai-agent.md). Wire types live in `@shared/agentContract`;
 * the run event stream is not here — it is a raw `fetch` in `features/agent/useAgentStream.ts`.
 */
export const agentApi = {
  listChats: async (): Promise<AgentChatDto[]> => {
    const response = await api.get<ApiResponse<{ chats: AgentChatDto[] }>>('/agent/chats', caps);
    return response.data.data.chats;
  },

  createChat: async (): Promise<AgentChatDto> => {
    const response = await api.post<ApiResponse<AgentChatDto>>('/agent/chats', {}, caps);
    return response.data.data;
  },

  getChat: async (chatId: string): Promise<AgentChatDetailDto> => {
    const response = await api.get<ApiResponse<AgentChatDetailDto>>(
      `/agent/chats/${encodeURIComponent(chatId)}`,
      caps,
    );
    return response.data.data;
  },

  renameChat: async (chatId: string, title: string): Promise<AgentChatDto> => {
    const response = await api.patch<ApiResponse<AgentChatDto>>(
      `/agent/chats/${encodeURIComponent(chatId)}`,
      { title },
      caps,
    );
    return response.data.data;
  },

  archiveChat: async (chatId: string): Promise<void> => {
    await api.delete<ApiResponse<{ ok: true }>>(`/agent/chats/${encodeURIComponent(chatId)}`, caps);
  },

  sendMessage: async (
    chatId: string,
    text: string,
  ): Promise<{ message: AgentMessageDto; runId: string }> => {
    const response = await api.post<ApiResponse<{ message: AgentMessageDto; runId: string }>>(
      `/agent/chats/${encodeURIComponent(chatId)}/messages`,
      { text },
      caps,
    );
    return response.data.data;
  },

  cancelRun: async (runId: string): Promise<void> => {
    await api.post<ApiResponse<{ ok: true }>>(`/agent/runs/${encodeURIComponent(runId)}/cancel`, undefined, caps);
  },

  /** `remember: 'always'` also stores ALWAYS_ALLOW once executed (`remembered`); critical tools → 400 PERMISSION_NOT_ALLOWED. */
  confirmAction: async (
    actionId: string,
    opts?: { remember?: 'always' },
  ): Promise<{ action: AgentPendingActionDto; runId: string | null; remembered?: boolean }> => {
    const response = await api.post<
      ApiResponse<{ action: AgentPendingActionDto; runId: string | null; remembered?: boolean }>
    >(
      `/agent/actions/${encodeURIComponent(actionId)}/confirm`,
      opts?.remember ? { remember: opts.remember } : undefined,
      caps,
    );
    return response.data.data;
  },

  rejectAction: async (actionId: string): Promise<{ action: AgentPendingActionDto }> => {
    const response = await api.post<ApiResponse<{ action: AgentPendingActionDto }>>(
      `/agent/actions/${encodeURIComponent(actionId)}/reject`,
      undefined,
      caps,
    );
    return response.data.data;
  },

  /** Client-executed action (§14.5): PENDING → CONFIRMED with a lease; same key within the lease → same attempt. */
  claimAction: async (actionId: string, clientKey: string): Promise<AgentClientClaimResponse> => {
    const response = await api.post<ApiResponse<AgentClientClaimResponse>>(
      `/agent/actions/${encodeURIComponent(actionId)}/claim`,
      { clientKey },
      caps,
    );
    return response.data.data;
  },

  /** What the app did for a claimed attempt; late reports (after the lease) are accepted. */
  reportAction: async (
    actionId: string,
    body: AgentClientReportRequest,
  ): Promise<{ action: AgentPendingActionDto; runId: string | null }> => {
    const response = await api.post<ApiResponse<{ action: AgentPendingActionDto; runId: string | null }>>(
      `/agent/actions/${encodeURIComponent(actionId)}/report`,
      body,
      caps,
    );
    return response.data.data;
  },

  listPermissions: async (): Promise<AgentToolPermissionDto[]> => {
    const response = await api.get<ApiResponse<{ tools: AgentToolPermissionDto[] }>>('/agent/permissions', caps);
    return response.data.data.tools;
  },

  setPermission: async (toolName: string, mode: AgentToolPermissionMode): Promise<AgentToolPermissionDto> => {
    const response = await api.put<ApiResponse<AgentToolPermissionDto>>(
      `/agent/permissions/${encodeURIComponent(toolName)}`,
      { mode },
      caps,
    );
    return response.data.data;
  },

  resetPermissions: async (): Promise<AgentToolPermissionDto[]> => {
    const response = await api.delete<ApiResponse<{ tools: AgentToolPermissionDto[] }>>('/agent/permissions', caps);
    return response.data.data.tools;
  },
};
