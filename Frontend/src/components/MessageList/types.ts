import type { ChatMessage, Poll } from '@/api/chat';
import type { ThreadInitialScroll } from '@/services/chat/chatOpenScrollPolicy';

export type MessageListHandle = {
  scrollToMessageById: (messageId: string) => void;
  scrollToBottomAlign: () => void;
  scrollToBottomSmooth: () => void;
};

export interface MessageListProps {
  messages: ChatMessage[];
  onAddReaction?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onReplyMessage?: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage) => void;
  onPollUpdated?: (messageId: string, updatedPoll: Poll) => void;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  isLoading?: boolean;
  isLoadingMessages?: boolean;
  isSwitchingChatType?: boolean;
  onScrollToMessage?: (messageId: string) => void;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
  isInitialLoad?: boolean;
  isLoadingMore?: boolean;
  isChannel?: boolean;
  userChatUser1Id?: string;
  userChatUser2Id?: string;
  onChatRequestRespond?: (messageId: string, accepted: boolean) => void;
  hasContextPanel?: boolean;
  pinnedMessageIds?: string[];
  onPin?: (message: ChatMessage) => void;
  onUnpin?: (messageId: string) => void;
  showReply?: boolean;
  onForwardMessage?: (message: ChatMessage) => void;
  threadScrollKey?: string | null;
  initialScroll?: ThreadInitialScroll;
  highlightAnchorMessageId?: string;
  openPaintGeneration?: number;
  threadLayoutSettling?: boolean;
  onChatScrollNearBottomChange?: (nearBottom: boolean) => void;
  scrollTargetMessageId?: string | null;
  loadingScrollTargetId?: string | null;
  onScrollTargetReached?: (messageId: string) => void;
  threadSearchOutlineQuery?: string | null;
  entityType?: string | null;
}
