import type { Bug } from '@/types';
import {
  patchThreadIndexGroupChannelBug,
  withPatchedBug,
  type ThreadIndexBugPatch,
} from '@/services/chat/chatThreadIndex';
import { useChatListFeedStore, type ChatsFilterType } from './chatListFeedStore';
import type { ChatItem } from './chatListTypes';

function patchListRows(
  patch: ThreadIndexBugPatch,
  onlyChannelId: string | undefined,
  channelIds: Set<string>
): void {
  const patchRows = (rows: ChatItem[]): ChatItem[] => {
    let changed = false;
    const next = rows.map((row) => {
      if (row.type !== 'group' && row.type !== 'channel') return row;
      if (onlyChannelId && row.data.id !== onlyChannelId) return row;
      const data = withPatchedBug(row.data, patch);
      if (data === row.data) return row;
      changed = true;
      channelIds.add(row.data.id);
      return { ...row, data };
    });
    return changed ? next : rows;
  };
  const store = useChatListFeedStore.getState();
  const filters = new Set<ChatsFilterType>([
    store.activeFilter,
    ...(Object.keys(store.filterCache) as ChatsFilterType[]),
  ]);
  for (const filter of filters) {
    store.patchRowsForFilter(filter, patchRows);
  }
}

/**
 * The bug PUT has no socket echo, so list rows (and the Dexie thread index merged over them)
 * keep the old status. Desktop re-opens a bug chat from that row snapshot without refetching,
 * so a stale row means a stale panel.
 */
export function applyBugUpdateToChatList(
  bug: Pick<Bug, 'id' | 'status' | 'bugType' | 'priority' | 'updatedAt'>,
  groupChannelId?: string
): void {
  const patch: ThreadIndexBugPatch = {
    id: bug.id,
    status: bug.status,
    bugType: bug.bugType,
    priority: bug.priority,
    updatedAt: bug.updatedAt,
  };
  const channelIds = new Set<string>(groupChannelId ? [groupChannelId] : []);
  patchListRows(patch, undefined, channelIds);
  for (const channelId of channelIds) {
    void patchThreadIndexGroupChannelBug(channelId, patch);
  }
}

/** Edits by someone else only reach us as BUG_* system messages in the bug's channel. */
export function applyBugChannelPatchToChatList(groupChannelId: string, patch: ThreadIndexBugPatch): void {
  patchListRows(patch, groupChannelId, new Set());
  void patchThreadIndexGroupChannelBug(groupChannelId, patch);
}
