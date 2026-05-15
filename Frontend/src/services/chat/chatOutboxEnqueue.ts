import { messageQueueStorage } from '@/services/chatMessageQueueStorage';

const pendingAdds = new Map<string, Promise<void>>();

export function registerOutboxEnqueue(tempId: string, ready: Promise<void>): void {
  const tracked = ready.finally(() => {
    pendingAdds.delete(tempId);
  });
  pendingAdds.set(tempId, tracked);
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
    const row = await messageQueueStorage.getByTempId(tempId);
    if (row) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return !!(await messageQueueStorage.getByTempId(tempId));
}
