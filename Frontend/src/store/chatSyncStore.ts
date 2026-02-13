import { create } from 'zustand';
import { ChatMessage } from '@/api/chat';

export type ChatContextType = 'GAME' | 'BUG' | 'USER' | 'GROUP';

function contextKey(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}

interface ChatSyncState {
  lastMessageIdByContext: Record<string, string>;
  missedMessagesByContext: Record<string, ChatMessage[]>;
  setLastMessageId: (contextType: ChatContextType, contextId: string, messageId: string | null) => void;
  getLastMessageId: (contextType: ChatContextType, contextId: string) => string | null;
  addMissedMessages: (contextType: ChatContextType, contextId: string, messages: ChatMessage[]) => void;
  getAndClearMissed: (contextType: ChatContextType, contextId: string) => ChatMessage[];
  syncInProgress: boolean;
  setSyncInProgress: (v: boolean) => void;
  lastSyncCompletedAt: number | null;
  setLastSyncCompletedAt: (t: number) => void;
}

export const useChatSyncStore = create<ChatSyncState>((set, get) => ({
  lastMessageIdByContext: {},
  missedMessagesByContext: {},
  setLastMessageId: (contextType, contextId, messageId) => {
    if (!messageId) return;
    const key = contextKey(contextType, contextId);
    set((s) => ({
      lastMessageIdByContext: { ...s.lastMessageIdByContext, [key]: messageId },
    }));
  },
  getLastMessageId: (contextType, contextId) => {
    const key = contextKey(contextType, contextId);
    return get().lastMessageIdByContext[key] ?? null;
  },
  addMissedMessages: (contextType, contextId, messages) => {
    if (messages.length === 0) return;
    const key = contextKey(contextType, contextId);
    set((s) => {
      const existing = s.missedMessagesByContext[key] ?? [];
      const ids = new Set(existing.map((m) => m.id));
      const appended = [...existing];
      for (const m of messages) {
        if (!ids.has(m.id)) {
          ids.add(m.id);
          appended.push(m);
        }
      }
      return {
        missedMessagesByContext: { ...s.missedMessagesByContext, [key]: appended },
      };
    });
  },
  getAndClearMissed: (contextType, contextId) => {
    const key = contextKey(contextType, contextId);
    const out = get().missedMessagesByContext[key] ?? [];
    set((s) => {
      const next = { ...s.missedMessagesByContext };
      delete next[key];
      return { missedMessagesByContext: next };
    });
    return out;
  },
  syncInProgress: false,
  setSyncInProgress: (v) => set({ syncInProgress: v }),
  lastSyncCompletedAt: null,
  setLastSyncCompletedAt: (t) => set({ lastSyncCompletedAt: t }),
}));
