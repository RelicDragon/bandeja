import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { loadOutboxVideoBlob } from '@/services/chat/chatOutboxMediaBlobs';

const pendingAdds = new Map<string, Promise<void>>();

export function registerOutboxEnqueue(tempId: string, ready: Promise<void>): void {
  const tracked = ready.finally(() => {
    pendingAdds.delete(tempId);
  });
  pendingAdds.set(tempId, tracked);
}

async function outboxRowReady(tempId: string): Promise<boolean> {
  const row = await messageQueueStorage.getByTempId(tempId);
  if (!row) return false;
  if (row.hasPendingVideoBlob) {
    return !!(await loadOutboxVideoBlob(tempId));
  }
  return true;
}

export async function waitForOutboxReady(tempId: string, timeoutMs = 4_000): Promise<boolean> {
  const pending = pendingAdds.get(tempId);
  if (pending) {
    await Promise.race([
      pending.catch(() => {}),
      new Promise<void>((r) => setTimeout(r, timeoutMs)),
    ]);
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await outboxRowReady(tempId)) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return outboxRowReady(tempId);
}
