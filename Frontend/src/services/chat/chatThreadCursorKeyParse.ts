import type { ChatContextType } from '@/api/chat';

const PREFIXES: ChatContextType[] = ['GAME', 'BUG', 'USER', 'GROUP'];

export function parseChatThreadCursorKey(
  key: string
): { contextType: ChatContextType; contextId: string } | null {
  for (const t of PREFIXES) {
    const prefix = `${t}:`;
    if (key.startsWith(prefix)) {
      return { contextType: t, contextId: key.slice(prefix.length) };
    }
  }
  return null;
}
