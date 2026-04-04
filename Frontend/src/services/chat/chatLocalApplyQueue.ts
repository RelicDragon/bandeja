import type { ChatContextType } from '@/api/chat';

const chainByContext = new Map<string, Promise<unknown>>();

function key(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}

export function enqueueChatLocalContextApply<T>(
  contextType: ChatContextType,
  contextId: string,
  fn: () => Promise<T>
): Promise<T> {
  const k = key(contextType, contextId);
  const prev = chainByContext.get(k) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => fn()) as Promise<T>;
  chainByContext.set(
    k,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}
