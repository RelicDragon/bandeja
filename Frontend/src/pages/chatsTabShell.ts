import type { ChatType } from '@/components/chat/ChatList';
import type { ChatSelection } from '@/utils/chatSelectionFromPath';

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
