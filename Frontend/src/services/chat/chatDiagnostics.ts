export function logChatOutboxBlobMismatch(
  source: 'send' | 'rehydrate',
  detail: { tempId: string; contextType?: string; contextId?: string; expected?: number; got?: number; kind?: 'image' | 'voice' }
): void {
  console.warn('[bandeja-chat] outbox blob mismatch', { source, ...detail });
}

export function logChatMediaCacheQuota(cacheKey: string): void {
  console.warn('[bandeja-chat] Cache API quota / write failed', { cacheKey: cacheKey.slice(0, 120) });
}
