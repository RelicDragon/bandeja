import { chatItemsFromUnreadGames, persistThreadIndexUpsert } from '@/services/chat/chatThreadIndex';
import { scheduleWarmFromUnreadApiPayload } from '@/services/chat/chatSyncBatchWarm';
import type { UnreadSnapshotDto } from '@/services/chat/unreadSnapshot';
import { usePlayersStore } from '@/store/playersStore';

function persistGamesThreadIndex(dto: UnreadSnapshotDto): void {
  const items = chatItemsFromUnreadGames(dto.games ?? []);
  if (items.length === 0) return;
  void persistThreadIndexUpsert('users', items);
}

/** Mirror USER:* counts into playersStore for DM list rows (badges use unreadStore). */
function syncPlayersStoreUserUnread(dto: UnreadSnapshotDto): void {
  const byContext = dto.byContext;
  const map: Record<string, number> = {};
  if (byContext && Object.keys(byContext).length > 0) {
    for (const [key, count] of Object.entries(byContext)) {
      if (!key.startsWith('USER:') || count <= 0) continue;
      map[key.slice(5)] = count;
    }
  } else {
    for (const row of dto.userChats ?? []) {
      if (row.chat?.id && row.unreadCount > 0) {
        map[row.chat.id] = row.unreadCount;
      }
    }
  }
  usePlayersStore.getState().applyUserUnreadCountsFromSnapshot(map);
}

export function runUnreadSnapshotSideEffects(dto: UnreadSnapshotDto): void {
  persistGamesThreadIndex(dto);
  scheduleWarmFromUnreadApiPayload(dto);
  syncPlayersStoreUserUnread(dto);
}

export function userUnreadMapFromByContext(
  byContext: Record<string, number>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [key, count] of Object.entries(byContext)) {
    if (!key.startsWith('USER:')) continue;
    const chatId = key.slice(5);
    if (count > 0) map[chatId] = count;
    else map[chatId] = 0;
  }
  return map;
}

export function syncPlayersStoreFromByContext(byContext: Record<string, number>): void {
  usePlayersStore.getState().applyUserUnreadCountsFromSnapshot(userUnreadMapFromByContext(byContext));
}
