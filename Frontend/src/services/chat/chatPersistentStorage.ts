import { logChatPersistentStorageDenied, logChatStoragePressure } from '@/services/chat/chatDiagnostics';

let persistOnceDone = false;

export async function ensureChatPersistentStorageOnce(): Promise<void> {
  if (persistOnceDone) return;
  persistOnceDone = true;
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
    const ok = await navigator.storage.persist();
    if (!ok) logChatPersistentStorageDenied();
  } catch {
    /* ignore */
  }
}

export async function probeChatStoragePressure(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
    const est = await navigator.storage.estimate();
    const quota = est.quota ?? 0;
    const usage = est.usage ?? 0;
    if (!quota || !usage) return;
    const usagePercent = Math.round((usage / quota) * 100);
    if (usagePercent >= 88) {
      logChatStoragePressure({ usage, quota, usagePercent });
    }
  } catch {
    /* ignore */
  }
}
