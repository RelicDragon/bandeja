export function logChatOutboxBlobMismatch(
  source: 'send' | 'rehydrate',
  detail: { tempId: string; contextType?: string; contextId?: string; expected?: number; got?: number; kind?: 'image' | 'voice' }
): void {
  console.warn('[bandeja-chat] outbox blob mismatch', { source, ...detail });
}

export function logChatMediaCacheQuota(cacheKey: string): void {
  console.warn('[bandeja-chat] Cache API quota / write failed', { cacheKey: cacheKey.slice(0, 120) });
}

export function logChatPersistentStorageDenied(): void {
  console.warn('[bandeja-chat] navigator.storage.persist() not granted; IndexedDB may be evicted under storage pressure');
}

export function logChatStoragePressure(detail: { usage: number; quota: number; usagePercent: number }): void {
  console.warn('[bandeja-chat] storage estimate high', detail);
}

export function logChatSocketQueueTrim(queue: string, dropped: number, cap: number): void {
  if (dropped <= 0) return;
  console.warn('[bandeja-chat] socket inbound queue trimmed', { queue, dropped, cap });
}
