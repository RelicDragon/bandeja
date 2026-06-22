import type { ThreadInitialScroll } from '@/services/chat/chatOpenScrollPolicy';
import type { MessageListProps } from './types';

function pinnedIdsEqual(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  const pa = a ?? [];
  const pb = b ?? [];
  if (pa.length !== pb.length) return false;
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) return false;
  }
  return true;
}

function initialScrollEqual(a?: ThreadInitialScroll, b?: ThreadInitialScroll): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if ('atBottom' in a && 'atBottom' in b) return a.atBottom === b.atBottom;
  if ('anchorMessageId' in a && 'anchorMessageId' in b) {
    return a.anchorMessageId === b.anchorMessageId;
  }
  return false;
}

export function messageListPropsEqual(prev: MessageListProps, next: MessageListProps): boolean {
  if (prev.messages !== next.messages) return false;
  if (prev.onAddReaction !== next.onAddReaction) return false;
  if (prev.onRemoveReaction !== next.onRemoveReaction) return false;
  if (prev.onDeleteMessage !== next.onDeleteMessage) return false;
  if (prev.onReplyMessage !== next.onReplyMessage) return false;
  if (prev.onEditMessage !== next.onEditMessage) return false;
  if (prev.onPollUpdated !== next.onPollUpdated) return false;
  if (prev.onResendQueued !== next.onResendQueued) return false;
  if (prev.onRemoveFromQueue !== next.onRemoveFromQueue) return false;
  if (prev.onScrollToMessage !== next.onScrollToMessage) return false;
  if (prev.onLoadMore !== next.onLoadMore) return false;
  if (prev.onChatRequestRespond !== next.onChatRequestRespond) return false;
  if (prev.onPin !== next.onPin) return false;
  if (prev.onUnpin !== next.onUnpin) return false;
  if (prev.onForwardMessage !== next.onForwardMessage) return false;
  if (prev.onChatScrollNearBottomChange !== next.onChatScrollNearBottomChange) return false;

  if (prev.isLoading !== next.isLoading) return false;
  if (prev.isLoadingMessages !== next.isLoadingMessages) return false;
  if (prev.isSwitchingChatType !== next.isSwitchingChatType) return false;
  if (prev.hasMoreMessages !== next.hasMoreMessages) return false;
  if (prev.isInitialLoad !== next.isInitialLoad) return false;
  if (prev.isLoadingMore !== next.isLoadingMore) return false;
  if (prev.isChannel !== next.isChannel) return false;
  if (prev.hasContextPanel !== next.hasContextPanel) return false;
  if (prev.showReply !== next.showReply) return false;
  if (prev.userChatUser1Id !== next.userChatUser1Id) return false;
  if (prev.userChatUser2Id !== next.userChatUser2Id) return false;
  if (prev.threadScrollKey !== next.threadScrollKey) return false;
  if (prev.highlightAnchorMessageId !== next.highlightAnchorMessageId) return false;
  if (prev.openPaintGeneration !== next.openPaintGeneration) return false;
  if (prev.threadLayoutSettling !== next.threadLayoutSettling) return false;
  if (prev.scrollTargetMessageId !== next.scrollTargetMessageId) return false;

  if (!pinnedIdsEqual(prev.pinnedMessageIds, next.pinnedMessageIds)) return false;
  if (!initialScrollEqual(prev.initialScroll, next.initialScroll)) return false;

  return true;
}
