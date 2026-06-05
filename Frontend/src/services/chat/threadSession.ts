import type { ChatContextType, ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import { peekChatFreshOpenNonce } from '@/services/chat/chatOpenEntry';
import type { ThreadInitialScroll } from '@/services/chat/chatOpenCoordinator';
import { mergeChatMessagesAscending } from '@/utils/chatMessageSort';

export type ThreadSessionKey = string;

export type ThreadOpenOptions = {
  contextType: ChatContextType;
  contextId: string;
  chatType?: ChatType;
  /** Monotonic nonce from navigation — re-bootstrap same thread key. */
  forceReload?: number;
  /** Deep-link / push: prefer this anchor when present in snapshot. */
  anchorMessageId?: string;
};

export type ThreadSessionScroll = ThreadInitialScroll;

export type LayoutSeedPlan = {
  threadKey: ThreadSessionKey;
  /** Visible list must clear before bootstrap paint. */
  clearVisible: boolean;
  warmRefMessages: ChatMessageWithStatus[];
  invalidateOpen: boolean;
  deleteWarmCache: boolean;
  flushOnUnmountKey: ThreadSessionKey | null;
};

export type ThreadTeardownPlan = {
  seededThreadKey: null;
  openPaintCommitted: false;
  openScrollReadyKey: null;
  hasLoaded: false;
  loadingId: undefined;
  isLoading: false;
};

export type ChatTypeSwitchPlan = {
  nextThreadKey: ThreadSessionKey;
  teardown: ThreadTeardownPlan;
  clearedVisible: ChatMessageWithStatus[];
};

export function resolveThreadKey(
  contextType: ChatContextType,
  contextId: string | undefined,
  chatType?: ChatType
): ThreadSessionKey | null {
  if (contextId == null || contextId === '') return null;
  return chatSyncTailKey(
    contextType,
    contextId,
    contextType === 'GAME' ? chatType : undefined
  );
}

export function resolveThreadKeyFromOpen(opts: ThreadOpenOptions): ThreadSessionKey | null {
  return resolveThreadKey(opts.contextType, opts.contextId, opts.chatType);
}

export function shouldForceFreshOpen(forceReloadSignal = 0, pushNonce = peekChatFreshOpenNonce()): boolean {
  return forceReloadSignal > 0 || pushNonce > 0;
}

export function shouldSkipLayoutSeed(
  threadKey: ThreadSessionKey,
  seededThreadKey: ThreadSessionKey | null,
  forceFreshOpen: boolean
): boolean {
  return threadKey === seededThreadKey && !forceFreshOpen;
}

export function planThreadTeardown(): ThreadTeardownPlan {
  return {
    seededThreadKey: null,
    openPaintCommitted: false,
    openScrollReadyKey: null,
    hasLoaded: false,
    loadingId: undefined,
    isLoading: false,
  };
}

export function planLayoutSeed(input: {
  threadKey: ThreadSessionKey;
  previousThreadKey: ThreadSessionKey | null;
  seededThreadKey: ThreadSessionKey | null;
  forceFreshOpen: boolean;
  warmCache: readonly ChatMessageWithStatus[];
}): LayoutSeedPlan {
  const skip = shouldSkipLayoutSeed(input.threadKey, input.seededThreadKey, input.forceFreshOpen);
  if (skip) {
    return {
      threadKey: input.threadKey,
      clearVisible: false,
      warmRefMessages: [],
      invalidateOpen: false,
      deleteWarmCache: false,
      flushOnUnmountKey: null,
    };
  }

  const flushKey =
    input.previousThreadKey && input.previousThreadKey !== input.threadKey
      ? input.previousThreadKey
      : null;

  return {
    threadKey: input.threadKey,
    clearVisible: true,
    warmRefMessages: [...input.warmCache],
    invalidateOpen: true,
    deleteWarmCache: input.forceFreshOpen,
    flushOnUnmountKey: flushKey,
  };
}

export function planChatTypeSwitch(input: {
  contextType: ChatContextType;
  contextId: string;
  toChatType: ChatType;
}): ChatTypeSwitchPlan {
  const nextThreadKey = resolveThreadKey(input.contextType, input.contextId, input.toChatType)!;
  return {
    nextThreadKey,
    teardown: planThreadTeardown(),
    clearedVisible: [],
  };
}

export function resolveSessionScroll(input: {
  storedAnchorMessageId?: string;
  openAnchorMessageId?: string;
  forceFreshOpen: boolean;
}): ThreadSessionScroll | undefined {
  if (input.forceFreshOpen) return { atBottom: true };
  const anchor = input.openAnchorMessageId ?? input.storedAnchorMessageId;
  if (anchor) return { anchorMessageId: anchor };
  return { atBottom: true };
}

export function resolveSessionScrollFromSnapshot(
  messages: readonly ChatMessageWithStatus[],
  openAnchorMessageId: string | undefined
): { anchorMessageId: string } | undefined {
  if (!openAnchorMessageId || !messages.some((m) => m.id === openAnchorMessageId)) {
    return undefined;
  }
  return { anchorMessageId: openAnchorMessageId };
}

/** Pending optimistics for target chat type only — sent rows from prior thread are dropped. */
export function pendingOptimisticsForChatTypeSwitch(
  prev: readonly ChatMessageWithStatus[],
  contextType: ChatContextType,
  targetChatType: ChatType
): ChatMessageWithStatus[] {
  const normalized = normalizeChatType(targetChatType);
  if (contextType === 'GAME') {
    return prev.filter(
      (m) =>
        Boolean(m._optimisticId) &&
        normalizeChatType((m as ChatMessage).chatType as ChatType) === normalized
    );
  }
  return prev.filter((m) => Boolean(m._optimisticId));
}

export function mergeChatTypeSwitchPaint(
  prev: readonly ChatMessageWithStatus[],
  local: readonly ChatMessage[],
  contextType: ChatContextType,
  targetChatType: ChatType
): ChatMessageWithStatus[] {
  const pending = pendingOptimisticsForChatTypeSwitch(prev, contextType, targetChatType);
  return mergeChatMessagesAscending(pending, [...local]) as ChatMessageWithStatus[];
}

export function messagesBelongToThreadKey(
  messages: readonly ChatMessageWithStatus[],
  threadKey: ThreadSessionKey
): boolean {
  if (messages.length === 0) return true;
  const parts = threadKey.split(':');
  const contextType = parts[0] as ChatContextType;
  const contextId = parts[1];
  if (!contextId) return false;
  const gameChatType = parts[2] as ChatType | undefined;
  return messages.every((m) => {
    if (m.contextId !== contextId || m.chatContextType !== contextType) return false;
    if (contextType === 'GAME' && gameChatType) {
      return normalizeChatType((m.chatType ?? 'PUBLIC') as ChatType) === normalizeChatType(gameChatType);
    }
    return true;
  });
}
