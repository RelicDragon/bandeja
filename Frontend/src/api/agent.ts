import api from './axios';
import type { ApiResponse } from '@/types';
import {
  AGENT_CLIENT_CAPS_HEADER,
  type AgentChatDetailDto,
  type AgentClientClaimResponse,
  type AgentClientReportRequest,
  type AgentChatDto,
  type AgentMemoryDto,
  type AgentMemoryOverviewDto,
  type AgentMemoryRestore,
  type AgentMessageDto,
  type AgentMessageFeedback,
  type AgentPendingActionDto,
  type AgentToolPermissionDto,
  type AgentToolPermissionMode,
  type AgentVoiceTranscriptionDto,
} from '@shared/agentContract';

/**
 * Every agent request says what this build can run in the app (booking plan §14.5): the
 * server stores it on the run, so tools may propose client-executed bookings.
 */
export const AGENT_CLIENT_CAPS = 'booking-v1';

/** One `GET /agent/chats` page: the main or the Archived list, plus the archived total. */
export interface AgentChatListData {
  chats: AgentChatDto[];
  archivedCount: number;
}
const caps = { headers: { [AGENT_CLIENT_CAPS_HEADER]: AGENT_CLIENT_CAPS } };

/**
 * AI agent chats (docs/plans/ai-agent.md). Wire types live in `@shared/agentContract`;
 * the run event stream is not here — it is a raw `fetch` in `features/agent/useAgentStream.ts`.
 */
export const agentApi = {
  /** `archived`: the Archived list instead of the main one. `archivedCount` is always the archived total. */
  listChats: async (opts: { archived?: boolean } = {}): Promise<AgentChatListData> => {
    const response = await api.get<ApiResponse<{ chats: AgentChatDto[]; archivedCount?: number }>>('/agent/chats', {
      ...caps,
      params: opts.archived ? { archived: '1' } : undefined,
    });
    return { chats: response.data.data.chats, archivedCount: response.data.data.archivedCount ?? 0 };
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

  setChatPinned: async (chatId: string, pinned: boolean): Promise<AgentChatDto> => {
    const response = await api.patch<ApiResponse<AgentChatDto>>(
      `/agent/chats/${encodeURIComponent(chatId)}`,
      { pinned },
      caps,
    );
    return response.data.data;
  },

  setChatArchived: async (chatId: string, archived: boolean): Promise<AgentChatDto> => {
    const response = await api.patch<ApiResponse<AgentChatDto>>(
      `/agent/chats/${encodeURIComponent(chatId)}`,
      { archived },
      caps,
    );
    return response.data.data;
  },

  /** Soft delete: the chat is hidden everywhere; the server keeps its rows. (Bare DELETE archives.) */
  deleteChat: async (chatId: string): Promise<void> => {
    await api.delete<ApiResponse<{ ok: true }>>(`/agent/chats/${encodeURIComponent(chatId)}`, {
      ...caps,
      params: { mode: 'delete' },
    });
  },

  sendMessage: async (
    chatId: string,
    text: string,
    /** Edit: the server drops this USER message and everything after it, then sends `text`. */
    editMessageId?: string,
    /** Voice-conversation turn: the reply is written to be read aloud. */
    voice?: boolean,
  ): Promise<{ message: AgentMessageDto; runId: string }> => {
    const response = await api.post<ApiResponse<{ message: AgentMessageDto; runId: string }>>(
      `/agent/chats/${encodeURIComponent(chatId)}/messages`,
      { text, ...(editMessageId ? { editMessageId } : {}), ...(voice ? { voice: true } : {}) },
      caps,
    );
    return response.data.data;
  },

  /** Speech → text (dictation and voice turns). `durationMs` is the charge fallback for containers without one. */
  transcribeVoice: async (audio: Blob, durationMs: number, signal?: AbortSignal): Promise<AgentVoiceTranscriptionDto> => {
    const response = await api.post<ApiResponse<AgentVoiceTranscriptionDto>>('/agent/voice/transcriptions', audio, {
      headers: { ...caps.headers, 'Content-Type': (audio.type || 'audio/webm').split(';')[0] },
      params: { durationMs: Math.max(0, Math.round(durationMs)) },
      timeout: 45_000,
      signal,
    });
    return response.data.data;
  },

  /** One spoken sentence: MP3 bytes. */
  speakVoice: async (text: string, signal?: AbortSignal): Promise<ArrayBuffer> => {
    const response = await api.post<ArrayBuffer>('/agent/voice/speech', { text }, {
      ...caps,
      responseType: 'arraybuffer',
      timeout: 30_000,
      signal,
    });
    return response.data;
  },

  /** Thumbs up / down on an assistant reply (`null` clears it); `comment` is optional free text. */
  setMessageFeedback: async (
    chatId: string,
    messageId: string,
    rating: AgentMessageFeedback | null,
    comment?: string,
  ): Promise<{ feedback: AgentMessageFeedback | null }> => {
    const response = await api.put<ApiResponse<{ feedback: AgentMessageFeedback | null }>>(
      `/agent/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/feedback`,
      comment ? { rating, comment } : { rating },
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

  /** Phase 11 memory (own rows only). */
  getMemory: async (): Promise<AgentMemoryOverviewDto> => {
    const response = await api.get<ApiResponse<AgentMemoryOverviewDto>>('/agent/memory', caps);
    return response.data.data;
  },

  setMemoryEnabled: async (enabled: boolean): Promise<AgentMemoryOverviewDto> => {
    const response = await api.put<ApiResponse<AgentMemoryOverviewDto>>('/agent/memory/settings', { enabled }, caps);
    return response.data.data;
  },

  /** `restore`: Undo of a delete (the item comes back with its own name, type and source). */
  addMemory: async (text: string, restore?: AgentMemoryRestore): Promise<AgentMemoryDto> => {
    const response = await api.post<ApiResponse<AgentMemoryDto>>(
      '/agent/memory/items',
      restore ? { text, restore } : { text },
      caps,
    );
    return response.data.data;
  },

  updateMemory: async (id: string, text: string): Promise<AgentMemoryDto> => {
    const response = await api.patch<ApiResponse<AgentMemoryDto>>(
      `/agent/memory/items/${encodeURIComponent(id)}`,
      { text },
      caps,
    );
    return response.data.data;
  },

  deleteMemory: async (id: string): Promise<void> => {
    await api.delete<ApiResponse<{ ok: true }>>(`/agent/memory/items/${encodeURIComponent(id)}`, caps);
  },

  clearMemory: async (): Promise<number> => {
    const response = await api.delete<ApiResponse<{ ok: true; deleted: number }>>('/agent/memory/items', caps);
    return response.data.data.deleted;
  },
};
