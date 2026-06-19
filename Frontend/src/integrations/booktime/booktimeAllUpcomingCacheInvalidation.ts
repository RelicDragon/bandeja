const listeners = new Set<() => void>();

export function subscribeBooktimeAllUpcomingCacheInvalidation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyBooktimeAllUpcomingCacheInvalidation(): void {
  listeners.forEach((listener) => listener());
}
