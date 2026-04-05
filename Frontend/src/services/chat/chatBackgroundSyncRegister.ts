export const CHAT_OFFLINE_BACKGROUND_SYNC_TAG = 'chat-offline-flush';

export function requestChatOfflineBackgroundSync(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.ready.then((reg) => {
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } })
      .sync;
    if (!sync?.register) return;
    void sync.register(CHAT_OFFLINE_BACKGROUND_SYNC_TAG).catch(() => {});
  });
}
