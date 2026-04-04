import type { ChatContextType } from '@/api/chat';

const CH = 'bandeja-chat-local';
const PULL_DEBOUNCE_MS = 450;
const TAB_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

let bc: BroadcastChannel | null = null;

type CoopMsg = { type: 'pull'; key: string; fromTab: string };

const pullTimers = new Map<string, ReturnType<typeof setTimeout>>();

function parseContextKey(key: string): { contextType: ChatContextType; contextId: string } | null {
  const i = key.indexOf(':');
  if (i <= 0) return null;
  const contextType = key.slice(0, i) as ChatContextType;
  const contextId = key.slice(i + 1);
  if (!contextId || !['GAME', 'BUG', 'USER', 'GROUP'].includes(contextType)) return null;
  return { contextType, contextId };
}

function schedulePull(key: string): void {
  const prev = pullTimers.get(key);
  if (prev) clearTimeout(prev);
  pullTimers.set(
    key,
    setTimeout(() => {
      pullTimers.delete(key);
      const parsed = parseContextKey(key);
      if (!parsed) return;
      void import('./chatSyncScheduler').then((m) =>
        m.enqueueChatSyncPull(parsed.contextType, parsed.contextId, m.SYNC_PRIORITY_COOP)
      );
    }, PULL_DEBOUNCE_MS)
  );
}

function ensureBc(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!bc) {
    bc = new BroadcastChannel(CH);
  }
  return bc;
}

let listenerAttached = false;

export function broadcastChatPullHint(key: string): void {
  const c = ensureBc();
  if (!c) return;
  try {
    c.postMessage({ type: 'pull', key, fromTab: TAB_ID } satisfies CoopMsg);
  } catch {
    /* ignore */
  }
}

export function ensureChatLocalCoopListener(): void {
  if (listenerAttached || typeof BroadcastChannel === 'undefined') return;
  const c = ensureBc();
  if (!c) return;
  listenerAttached = true;
  c.onmessage = (ev: MessageEvent<CoopMsg>) => {
    const d = ev.data;
    if (!d || d.type !== 'pull' || typeof d.key !== 'string') return;
    if (d.fromTab === TAB_ID) return;
    schedulePull(d.key);
  };
}
