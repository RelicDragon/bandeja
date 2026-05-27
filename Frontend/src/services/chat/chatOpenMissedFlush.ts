import type { ChatContextType, ChatMessage } from '@/api/chat';
import type { ChatType } from '@/types';
import { mergeChatMessagesAscending } from '@/utils/chatMessageSort';
import { useChatSyncStore } from '@/store/chatSyncStore';

/** Merge missed buffers for all game tab heads (pre-paint flush). */
export function takeAllGameTabMissedMessages(contextId: string): ChatMessage[] {
  const tabs: ChatType[] = ['PUBLIC', 'PRIVATE', 'ADMINS'];
  const store = useChatSyncStore.getState();
  const collected: ChatMessage[] = [];
  for (const tab of tabs) {
    collected.push(...store.getAndClearMissed('GAME', contextId, tab));
  }
  if (collected.length === 0) return [];
  return mergeChatMessagesAscending([], collected);
}

/** In-memory missed buffer from foreground sync — merge before open paint (all context types). */
export function takeMissedMessagesForOpen(
  contextType: ChatContextType,
  contextId: string,
  gameChatType?: ChatType
): ChatMessage[] {
  if (contextType === 'GAME') {
    return takeAllGameTabMissedMessages(contextId);
  }
  return useChatSyncStore.getState().getAndClearMissed(contextType, contextId, gameChatType);
}

export function mergeMissedIntoWarmRef(
  warm: readonly ChatMessage[],
  missed: readonly ChatMessage[]
): ChatMessage[] {
  if (missed.length === 0) return [...warm];
  const incoming = [...missed];
  if (warm.length === 0) return mergeChatMessagesAscending([], incoming);
  return mergeChatMessagesAscending([...warm], incoming);
}
