import { normalizeClientMutationId } from '@bandeja/chat-contract';
import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { ChatType } from '@/types';
import { compareChatMessagesAscending } from '@/utils/chatMessageCompare';
import { normalizeChatType } from '@/utils/chatType';

export { normalizeClientMutationId };

function sortMessagesAscending(messages: ChatMessageWithStatus[]): ChatMessageWithStatus[] {
  const sorted = [...messages];
  sorted.sort(compareChatMessagesAscending);
  return sorted;
}

export function isPendingOptimistic(m: ChatMessageWithStatus): boolean {
  return m._status === 'SENDING' || m._status === 'FAILED';
}

export function findPendingOptimisticIndex(
  messages: readonly ChatMessageWithStatus[],
  clientMutationId: string
): number {
  const cid = normalizeClientMutationId(clientMutationId);
  if (!cid) return -1;
  return messages.findIndex((m) => {
    const sm = m as ChatMessageWithStatus;
    return isPendingOptimistic(sm) && normalizeClientMutationId(sm._clientMutationId) === cid;
  });
}

/** Drop pending rows superseded by server messages with the same clientMutationId. */
export function stripPendingOptimisticsMatchedByServer(
  messages: ChatMessageWithStatus[],
  serverMessages: readonly ChatMessage[]
): ChatMessageWithStatus[] {
  const serverCids = new Set<string>();
  for (const m of serverMessages) {
    const cid = normalizeClientMutationId(m.clientMutationId);
    if (cid) serverCids.add(cid);
  }
  if (serverCids.size === 0) return messages;
  return messages.filter((m) => {
    const sm = m as ChatMessageWithStatus;
    if (!isPendingOptimistic(sm)) return true;
    const cid = normalizeClientMutationId(sm._clientMutationId ?? m.clientMutationId);
    return !cid || !serverCids.has(cid);
  });
}

export type ReplacePendingResult = {
  next: ChatMessageWithStatus[];
  replacedOptimisticId?: string;
};

/** Replace a pending optimistic row with the server message (clears _status). */
export function replacePendingOptimisticWithServer(
  prev: readonly ChatMessageWithStatus[],
  pendingIdx: number,
  serverMessage: ChatMessage
): ReplacePendingResult {
  const prevRow = prev[pendingIdx] as ChatMessageWithStatus;
  const replacedOptimisticId = prevRow._optimisticId;
  const next = [...prev];
  next[pendingIdx] = {
    ...serverMessage,
    _clientMutationId: serverMessage.clientMutationId ?? prevRow._clientMutationId,
  } as ChatMessageWithStatus;
  return { next, replacedOptimisticId };
}

/** Remove pending row when server message id is already in the list. */
export function removePendingOptimisticAt(
  prev: readonly ChatMessageWithStatus[],
  pendingIdx: number
): ReplacePendingResult {
  const prevRow = prev[pendingIdx] as ChatMessageWithStatus;
  const next = prev.filter((_, i) => i !== pendingIdx);
  return { next, replacedOptimisticId: prevRow._optimisticId };
}

export type OptimisticReconcileKind = 'replace' | 'remove-pending' | 'append' | 'noop';

export type OptimisticReconcileResult = {
  messages: ChatMessageWithStatus[];
  removedOptimisticIds: string[];
  replacedOptimisticIds: string[];
  actions: OptimisticReconcileKind[];
};

export type OptimisticReconcileParams = {
  messages: readonly ChatMessageWithStatus[];
  incoming: readonly ChatMessage[];
  userId?: string;
  /** Send-ack path: match pending row by optimistic temp id on first incoming row. */
  optimisticIdHint?: string;
};

function isOwnMessage(message: ChatMessage, userId: string | undefined): boolean {
  return Boolean(userId && message.senderId === userId);
}

function messageTypeOf(msg: ChatMessage): string {
  return msg.messageType ?? 'TEXT';
}

function findPendingOptimisticByFingerprint(
  prev: readonly ChatMessageWithStatus[],
  serverMessage: ChatMessage,
  normalizedMessageChatType: ChatType
): number {
  const msgReplyToId = serverMessage.replyToId ?? null;
  const msgMentionIds = serverMessage.mentionIds?.slice().sort() ?? [];
  return prev.findIndex((m): m is ChatMessageWithStatus => {
    if (!isPendingOptimistic(m)) return false;
    if (m.senderId !== serverMessage.senderId) return false;
    if (messageTypeOf(m) !== messageTypeOf(serverMessage)) return false;
    if (serverMessage.messageType === 'VOICE' || serverMessage.messageType === 'VIDEO') {
      return (m.mediaUrls?.[0] ?? '') === (serverMessage.mediaUrls?.[0] ?? '');
    }
    if (m.content !== serverMessage.content) return false;
    if (normalizeChatType(m.chatType) !== normalizedMessageChatType) return false;
    if ((m.replyToId ?? null) !== msgReplyToId) return false;
    const mIds = (m.mentionIds?.slice().sort() ?? []) as string[];
    return (
      mIds.length === msgMentionIds.length && !mIds.some((mid, i) => mid !== msgMentionIds[i])
    );
  });
}

type SingleReconcileOutcome = {
  messages: ChatMessageWithStatus[];
  removedOptimisticIds: string[];
  replacedOptimisticIds: string[];
  action: OptimisticReconcileKind;
};

function reconcileOneServerMessage(
  prev: readonly ChatMessageWithStatus[],
  serverMessage: ChatMessage,
  opts: { userId?: string; optimisticIdHint?: string }
): SingleReconcileOutcome {
  const { userId, optimisticIdHint } = opts;
  const own = isOwnMessage(serverMessage, userId);
  const serverCid = normalizeClientMutationId(serverMessage.clientMutationId);
  const normalizedMessageChatType = normalizeChatType(serverMessage.chatType);
  const hasServerId = prev.some((m) => m.id === serverMessage.id);

  let pendingIdx = -1;
  if (optimisticIdHint) {
    pendingIdx = prev.findIndex((m) => m._optimisticId === optimisticIdHint);
  }
  if (pendingIdx < 0 && serverCid) {
    pendingIdx = findPendingOptimisticIndex(prev, serverCid);
  }

  if (hasServerId) {
    if (own && serverCid) {
      const dupPendingIdx = findPendingOptimisticIndex(prev, serverCid);
      if (dupPendingIdx >= 0) {
        const { next, replacedOptimisticId } = removePendingOptimisticAt(prev, dupPendingIdx);
        return {
          messages: next,
          removedOptimisticIds: replacedOptimisticId ? [replacedOptimisticId] : [],
          replacedOptimisticIds: [],
          action: 'remove-pending',
        };
      }
    }
    return {
      messages: [...prev],
      removedOptimisticIds: [],
      replacedOptimisticIds: [],
      action: 'noop',
    };
  }

  if (pendingIdx >= 0) {
    const { next, replacedOptimisticId } = replacePendingOptimisticWithServer(
      prev,
      pendingIdx,
      serverMessage
    );
    return {
      messages: sortMessagesAscending(next),
      removedOptimisticIds: [],
      replacedOptimisticIds: replacedOptimisticId ? [replacedOptimisticId] : [],
      action: 'replace',
    };
  }

  if (own && serverCid) {
    const idx = findPendingOptimisticIndex(prev, serverCid);
    if (idx >= 0) {
      const { next, replacedOptimisticId } = replacePendingOptimisticWithServer(prev, idx, serverMessage);
      return {
        messages: sortMessagesAscending(next),
        removedOptimisticIds: [],
        replacedOptimisticIds: replacedOptimisticId ? [replacedOptimisticId] : [],
        action: 'replace',
      };
    }
  }

  if (own) {
    const idx = findPendingOptimisticByFingerprint(prev, serverMessage, normalizedMessageChatType);
    if (idx >= 0) {
      const { next, replacedOptimisticId } = replacePendingOptimisticWithServer(prev, idx, serverMessage);
      return {
        messages: sortMessagesAscending(next),
        removedOptimisticIds: [],
        replacedOptimisticIds: replacedOptimisticId ? [replacedOptimisticId] : [],
        action: 'replace',
      };
    }
  }

  return {
    messages: sortMessagesAscending([...prev, serverMessage as ChatMessageWithStatus]),
    removedOptimisticIds: [],
    replacedOptimisticIds: [],
    action: 'append',
  };
}

/** Reconcile pending optimistic rows against incoming server message(s). */
export function reconcileOptimisticMessages(
  params: OptimisticReconcileParams
): OptimisticReconcileResult {
  const { messages, incoming, userId, optimisticIdHint } = params;
  let current = [...messages];
  const removedOptimisticIds: string[] = [];
  const replacedOptimisticIds: string[] = [];
  const actions: OptimisticReconcileKind[] = [];

  for (let i = 0; i < incoming.length; i++) {
    const outcome = reconcileOneServerMessage(current, incoming[i]!, {
      userId,
      optimisticIdHint: i === 0 ? optimisticIdHint : undefined,
    });
    current = outcome.messages;
    removedOptimisticIds.push(...outcome.removedOptimisticIds);
    replacedOptimisticIds.push(...outcome.replacedOptimisticIds);
    actions.push(outcome.action);
  }

  return { messages: current, removedOptimisticIds, replacedOptimisticIds, actions };
}
