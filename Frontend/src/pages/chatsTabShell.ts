import type { ChatType } from '@/components/chat/ChatList';
import type { ChatSelection } from '@/utils/chatSelectionFromPath';
import { buildUrl } from '@/utils/urlSchema';

export type ChatsListFilter = 'users' | 'bugs' | 'channels' | 'market';

/** Path for list → thread nav. Market channel chats must keep `filter=market` so URL sync does not flip the left pane to Channels. */
export function buildChatSelectPath(
  chatId: string,
  chatType: ChatType,
  chatsFilter: ChatsListFilter,
  opts?: { role?: 'buyer' | 'seller'; item?: string }
): string {
  if (chatsFilter === 'bugs' && chatType === 'channel') return `/bugs/${chatId}`;
  if (chatType === 'user') return `/user-chat/${chatId}`;
  if (chatType === 'game') return `/games/${chatId}/chat`;
  if (chatType === 'group') return `/group-chat/${chatId}`;
  if (chatsFilter === 'market') {
    return buildUrl('channelChat', {
      id: chatId,
      filter: 'market',
      ...(opts?.role ? { role: opts.role } : {}),
      ...(opts?.item ? { item: opts.item } : {}),
    });
  }
  return `/channel-chat/${chatId}`;
}

/** A1.2: selection drives paint; URL catches up without unmounting GameChat. */
export function shouldRenderEmbeddedGameChat(
  selectedChatId: string | null,
  selectedChatType: ChatType | null
): boolean {
  return Boolean(selectedChatId && selectedChatType);
}

export function isChatPanelPathSynced(
  pathSelection: ChatSelection,
  selectedChatId: string,
  selectedChatType: ChatType
): boolean {
  return pathSelection.id === selectedChatId && pathSelection.type === selectedChatType;
}

export function isChatPanelReady(
  isDesktop: boolean,
  selectedChatId: string | null,
  selectedChatType: ChatType | null,
  pathSelection: ChatSelection
): boolean {
  if (!isDesktop || !selectedChatId || !selectedChatType) return true;
  return isChatPanelPathSynced(pathSelection, selectedChatId, selectedChatType);
}

/** A1.1: overlay only while transitioning; never blank panel waiting on URL. */
export function desktopRightPanelTransition(
  isTransitioning: boolean,
  chatPanelReady: boolean
): { showOverlay: boolean; hideContent: boolean } {
  if (!isTransitioning) {
    return { showOverlay: false, hideContent: false };
  }
  if (chatPanelReady) {
    return { showOverlay: false, hideContent: false };
  }
  return { showOverlay: true, hideContent: false };
}
