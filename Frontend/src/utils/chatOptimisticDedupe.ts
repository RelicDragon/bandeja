import type { ChatMessage, ChatMessageWithStatus } from '@/api/chat';

export function normalizeClientMutationId(cid: string | null | undefined): string {
  return cid?.trim() ?? '';
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
