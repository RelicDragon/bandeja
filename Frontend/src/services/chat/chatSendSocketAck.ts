import type { ChatContextType, ChatMessage } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';

type PendingAck = {
  contextType: ChatContextType;
  contextId: string;
  resolve: (message: ChatMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pendingByMutationId = new Map<string, PendingAck>();

function ackKey(clientMutationId: string): string {
  return clientMutationId.trim();
}

export function waitForChatSendSocketAck(params: {
  contextType: ChatContextType;
  contextId: string;
  clientMutationId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ChatMessage | null> {
  const cid = ackKey(params.clientMutationId);
  if (!cid) return Promise.resolve(null);

  const existing = pendingByMutationId.get(cid);
  if (existing) {
    clearTimeout(existing.timer);
    pendingByMutationId.delete(cid);
    existing.reject(new Error('superseded'));
  }

  return new Promise((resolve, reject) => {
    const finish = (fn: () => void) => {
      const row = pendingByMutationId.get(cid);
      if (!row) return;
      clearTimeout(row.timer);
      pendingByMutationId.delete(cid);
      params.signal?.removeEventListener('abort', onAbort);
      fn();
    };

    const onAbort = () => {
      finish(() => reject(new DOMException('Aborted', 'AbortError')));
    };

    const timer = setTimeout(() => {
      finish(() => resolve(null));
    }, params.timeoutMs ?? 15_000);

    pendingByMutationId.set(cid, {
      contextType: params.contextType,
      contextId: params.contextId,
      resolve: (m) => finish(() => resolve(m)),
      reject: (e) => finish(() => reject(e)),
      timer,
    });

    if (params.signal?.aborted) {
      onAbort();
      return;
    }
    params.signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Returns true when a pending outbox send was completed via socket. */
export function deliverChatSendSocketAck(
  contextType: string,
  contextId: string,
  message: ChatMessage
): boolean {
  const cid = message.clientMutationId?.trim();
  if (!cid) return false;
  const userId = useAuthStore.getState().user?.id;
  if (!userId || message.senderId !== userId) return false;

  const row = pendingByMutationId.get(cid);
  if (!row) return false;
  if (row.contextType !== contextType || row.contextId !== contextId) return false;

  row.resolve(message);
  return true;
}

/** Test-only reset */
export function resetChatSendSocketAckForTests(): void {
  for (const row of pendingByMutationId.values()) {
    clearTimeout(row.timer);
    row.reject(new Error('reset'));
  }
  pendingByMutationId.clear();
}
