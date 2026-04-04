import { create } from 'zustand';
import type { ChatContextType, ChatMessage } from '@/api/chat';
import type { ChatType } from '@/types';
import { chatSyncTailKey } from '@/utils/chatSyncScope';

interface ChatSyncState {
  lastMessageIdByContext: Record<string, string>;
  missedMessagesByContext: Record<string, ChatMessage[]>;
  setLastMessageId: (
    contextType: ChatContextType,
    contextId: string,
    messageId: string | null,
    gameChatType?: ChatType
  ) => void;
  getLastMessageId: (contextType: ChatContextType, contextId: string, gameChatType?: ChatType) => string | null;
  addMissedMessages: (
    contextType: ChatContextType,
    contextId: string,
    messages: ChatMessage[],
    gameChatType?: ChatType
  ) => void;
  getAndClearMissed: (contextType: ChatContextType, contextId: string, gameChatType?: ChatType) => ChatMessage[];
  syncInProgress: boolean;
  setSyncInProgress: (v: boolean) => void;
  lastSyncCompletedAt: number | null;
  setLastSyncCompletedAt: (t: number) => void;
  lastThreadPaintSource: 'dexie' | 'network' | null;
  lastThreadPaintAt: number | null;
  setLastThreadPaint: (source: 'dexie' | 'network') => void;
  clearChatSyncTailState: (contextType: ChatContextType, contextId: string) => void;
  chatListDexieBump: number;
  bumpChatListDexieBump: () => void;
  resetChatListDexieBump: () => void;
}

export const useChatSyncStore = create<ChatSyncState>((set, get) => ({
  lastMessageIdByContext: {},
  missedMessagesByContext: {},
  setLastMessageId: (contextType, contextId, messageId, gameChatType) => {
    if (!messageId) return;
    const key = chatSyncTailKey(contextType, contextId, gameChatType);
    set((s) => ({
      lastMessageIdByContext: { ...s.lastMessageIdByContext, [key]: messageId },
    }));
  },
  getLastMessageId: (contextType, contextId, gameChatType) => {
    const key = chatSyncTailKey(contextType, contextId, gameChatType);
    return get().lastMessageIdByContext[key] ?? null;
  },
  addMissedMessages: (contextType, contextId, messages, gameChatType) => {
    if (messages.length === 0) return;
    const key = chatSyncTailKey(contextType, contextId, gameChatType);
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
  getAndClearMissed: (contextType, contextId, gameChatType) => {
    const key = chatSyncTailKey(contextType, contextId, gameChatType);
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
  lastThreadPaintSource: null,
  lastThreadPaintAt: null,
  setLastThreadPaint: (source) =>
    set({ lastThreadPaintSource: source, lastThreadPaintAt: Date.now() }),
  chatListDexieBump: 0,
  bumpChatListDexieBump: () => set((s) => ({ chatListDexieBump: s.chatListDexieBump + 1 })),
  resetChatListDexieBump: () => set({ chatListDexieBump: 0 }),
  clearChatSyncTailState: (contextType, contextId) => {
    const match =
      contextType === 'GAME'
        ? (k: string) => k.startsWith(`GAME:${contextId}:`)
        : (k: string) => k === `${contextType}:${contextId}`;
    set((s) => {
      const nextLast = { ...s.lastMessageIdByContext };
      const nextMissed = { ...s.missedMessagesByContext };
      for (const k of Object.keys(nextLast)) {
        if (match(k)) delete nextLast[k];
      }
      for (const k of Object.keys(nextMissed)) {
        if (match(k)) delete nextMissed[k];
      }
      return { lastMessageIdByContext: nextLast, missedMessagesByContext: nextMissed };
    });
  },
}));

export type { ChatContextType } from '@/api/chat';
