const listeners = new Set<() => void>();

export function subscribeBooktimeAllUpcomingCacheInvalidation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyBooktimeAllUpcomingCacheInvalidation(): void {
  listeners.forEach((listener) => listener());
}

/** Clears loader + hook caches after auth identity changes (connect / disconnect / expiry). */
export function invalidateExternalBookingCache(): void {
  void import('./booktimeAllUpcomingLoader').then(({ invalidateBooktimeAllUpcomingCache }) => {
    invalidateBooktimeAllUpcomingCache();
  });
}
