const preferences = new Map<string, boolean>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Session-scoped Show original preference per game (survives remounts in this tab). */
export function getGameTextShowOriginal(gameId: string): boolean {
  return preferences.get(gameId) === true;
}

export function setGameTextShowOriginal(gameId: string, showOriginal: boolean): void {
  const prev = preferences.get(gameId) === true;
  if (prev === showOriginal) return;
  if (showOriginal) preferences.set(gameId, true);
  else preferences.delete(gameId);
  emit();
}

export function toggleGameTextShowOriginal(gameId: string): boolean {
  const next = !getGameTextShowOriginal(gameId);
  setGameTextShowOriginal(gameId, next);
  return next;
}

export function subscribeGameTextShowOriginal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — clears session preferences. */
export function clearGameTextShowOriginalSession(): void {
  if (preferences.size === 0) return;
  preferences.clear();
  emit();
}
