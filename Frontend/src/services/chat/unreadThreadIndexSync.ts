import { useUnreadStore } from '@/store/unreadStore';
import { type ContextKey, parseContextKey } from '@/services/chat/unreadSnapshot';
import { patchThreadIndexSetUnreadCount } from '@/services/chat/chatThreadIndex';

function syncThreadIndexFromByContextDelta(
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

/** §5.4 — mirror unreadStore.byContext into Dexie thread index rows. */
export function installUnreadThreadIndexSync(): void {
  if (installed) return;
  installed = true;

  let prevByContext = useUnreadStore.getState().byContext;
  useUnreadStore.subscribe((state) => {
    const nextByContext = state.byContext;
    if (nextByContext === prevByContext) return;
    syncThreadIndexFromByContextDelta(prevByContext, nextByContext);
    prevByContext = nextByContext;
  });
}
