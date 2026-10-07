import type { Bug } from '@/types';
import {
  patchThreadIndexGroupChannelBug,
  withPatchedBug,
  type ThreadIndexBugPatch,
} from '@/services/chat/chatThreadIndex';
import { useChatListFeedStore, type ChatsFilterType } from './chatListFeedStore';
import type { ChatItem } from './chatListTypes';

function patchRows(rows: ChatItem[], bug: ThreadIndexBugPatch, channelIds: Set<string>): ChatItem[] {
  let changed = false;
  const next = rows.map((row) => {
    if (row.type !== 'group' && row.type !== 'channel') return row;
    const data = withPatchedBug(row.data, bug);
    if (data === row.data) return row;
    changed = true;
    channelIds.add(row.data.id);
    return { ...row, data };
  });
  return changed ? next : rows;
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
  const store = useChatListFeedStore.getState();
  const filters = new Set<ChatsFilterType>([
    store.activeFilter,
    ...(Object.keys(store.filterCache) as ChatsFilterType[]),
  ]);
  for (const filter of filters) {
    store.patchRowsForFilter(filter, (prev) => patchRows(prev, patch, channelIds));
  }
  for (const channelId of channelIds) {
    void patchThreadIndexGroupChannelBug(channelId, patch);
  }
}
