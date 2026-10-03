import type { AgentChatDto } from '@shared/agentContract';

export type AgentChatListView = 'main' | 'archived';

/** The server's list order: pinned first (most recently pinned on top), then by last activity. */
export function sortAgentChats(chats: AgentChatDto[]): AgentChatDto[] {
  return [...chats].sort((a, b) => {
    const pa = a.pinnedAt ?? '';
    const pb = b.pinnedAt ?? '';
    if (pa !== pb) return pa < pb ? 1 : -1;
    return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
  });
}

/** Optimistic pin / unpin of one row, re-sorted into place. */
export function withAgentChatPinned(chats: AgentChatDto[], chatId: string, pinned: boolean, now = new Date()) {
  return sortAgentChats(
    chats.map((c) => (c.id === chatId ? { ...c, pinnedAt: pinned ? now.toISOString() : null } : c)),
  );
}

/** Drop one row from a list page; `archivedDelta` moves the Archived total (never below 0). */
export function withoutAgentChat<T extends { chats: AgentChatDto[]; archivedCount: number }>(
  list: T,
  chatId: string,
  archivedDelta: number,
): T {
  return {
    ...list,
    chats: list.chats.filter((c) => c.id !== chatId),
    archivedCount: Math.max(0, list.archivedCount + archivedDelta),
  };
}
