import { useUnreadStore } from '@/store/unreadStore';
import { type ContextKey, parseContextKey } from '@/services/chat/unreadSnapshot';
import { patchThreadIndexSetUnreadCount } from '@/services/chat/chatThreadIndex';

function syncThreadIndexFromDisplayedDelta(
  prev: Record<ContextKey, number>,
  next: Record<ContextKey, number>
): void {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)] as ContextKey[]);
  for (const key of keys) {
    const prevN = prev[key] ?? 0;
    const nextN = next[key] ?? 0;
    if (prevN === nextN) continue;
    const parsed = parseContextKey(key);
    if (!parsed) continue;
    void patchThreadIndexSetUnreadCount(parsed.contextType, parsed.contextId, nextN);
  }
}

let installed = false;

/** Mirror unreadStore.displayedByContext into Dexie thread index rows. */
export function installUnreadThreadIndexSync(): void {
  if (installed) return;
  installed = true;

  let prevDisplayed = useUnreadStore.getState().displayedByContext;
  useUnreadStore.subscribe((state) => {
    const nextDisplayed = state.displayedByContext;
    if (nextDisplayed === prevDisplayed) return;
    syncThreadIndexFromDisplayedDelta(prevDisplayed, nextDisplayed);
    prevDisplayed = nextDisplayed;
  });
}
