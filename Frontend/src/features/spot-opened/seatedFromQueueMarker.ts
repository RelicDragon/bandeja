/**
 * PRD 347 — remembers that auto-fill seated this user, so the green
 * "You were seated from the queue" header can appear the next time they open
 * the game even if the push arrived while the app was closed.
 *
 * Deliberately one-shot: reading it consumes it. Storage failures (private
 * mode, quota) degrade to "no banner", never to a thrown render.
 */
const PENDING_KEY_PREFIX = 'bandeja.spots.seatedFromQueue.pending.';
const SEEN_KEY_PREFIX = 'bandeja.spots.seatedFromQueue.seen.';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/** Called when the "You're in!" push arrives or is tapped. */
export function markSeatedFromQueuePending(gameId: string): void {
  if (!gameId) return;
  safeSet(`${PENDING_KEY_PREFIX}${gameId}`, '1');
}

export function hasSeatedFromQueuePending(gameId: string): boolean {
  return safeGet(`${PENDING_KEY_PREFIX}${gameId}`) === '1';
}

export function hasShownSeatedFromQueue(gameId: string): boolean {
  return safeGet(`${SEEN_KEY_PREFIX}${gameId}`) === '1';
}

/** Consumes the pending flag and records that the banner has been shown. */
export function consumeSeatedFromQueue(gameId: string): void {
  safeRemove(`${PENDING_KEY_PREFIX}${gameId}`);
  safeSet(`${SEEN_KEY_PREFIX}${gameId}`, '1');
}
