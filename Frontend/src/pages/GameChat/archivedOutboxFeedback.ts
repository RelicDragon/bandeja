import type { TFunction } from 'i18next';
import type { ChatContextType } from '@/api/chat';
import type { ChatOutboxRemovedDetail } from '@/services/chat/chatOutboxEvents';

export function getArchivedOutboxDropCount(
  detail: ChatOutboxRemovedDetail | null | undefined,
  contextType: ChatContextType,
  contextId: string | undefined
): number {
  if (!detail || !contextId || detail.contextType !== contextType || detail.contextId !== contextId) {
    return 0;
  }
  if (detail.reason !== 'threadArchived' || detail.archiveReason !== 'game_cancelled') {
    return 0;
  }
  return detail.tempIds.length;
}

export function formatArchivedOutboxFeedback(t: TFunction, count: number): string {
  return t('chat.archivedOutboxDropped', {
    count,
    defaultValue:
      count === 1
        ? 'A message was not sent because this game was cancelled and chat is now read-only.'
        : '{{count}} messages were not sent because this game was cancelled and chat is now read-only.',
  });
}
