import { chatItemsFromUnreadGames, persistThreadIndexUpsert } from '@/services/chat/chatThreadIndex';
import { scheduleWarmFromUnreadApiPayload } from '@/services/chat/chatSyncBatchWarm';
import type { UnreadSnapshotDto } from '@/services/chat/unreadSnapshot';

function persistGamesThreadIndex(dto: UnreadSnapshotDto): void {
  const items = chatItemsFromUnreadGames(dto.games ?? []);
  if (items.length === 0) return;
  void persistThreadIndexUpsert('users', items);
}

export function runUnreadSnapshotSideEffects(dto: UnreadSnapshotDto): void {
  persistGamesThreadIndex(dto);
  scheduleWarmFromUnreadApiPayload(dto);
}
