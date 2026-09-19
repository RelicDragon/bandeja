import { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { MessageGroupPosition } from '@/utils/chatMessageGrouping';

export interface ContextMenuState {
  isOpen: boolean;
  messageId: string | null;
  position: { x: number; y: number };
}

/**
 * Row callbacks, bundled into one object so the memoised row components can compare them by
 * identity. Comparing them individually (or, worse, skipping them) let a row keep the callbacks
 * it mounted with — e.g. the `undefined` reaction handlers passed before `canWriteChat` resolves.
 */
export interface MessageRowHandlers {
  onAddReaction?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onReplyMessage?: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage) => void;
  onPollUpdated?: (messageId: string, updatedPoll: import('@/api/chat').Poll) => void;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  onScrollToFirstReply?: (parentMessageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  onChatRequestRespond?: (messageId: string, accepted: boolean) => void;
  onPin?: (message: ChatMessage) => void;
  onUnpin?: (messageId: string) => void;
  onForwardMessage?: (message: ChatMessage) => void;
  onOpenChatMedia?: (messageId: string, mediaIndex: number) => void;
}

/** Non-callback row inputs shared by `AnimatedMessageItem` and `MessageItem`. */
export interface MessageRowConfig {
  replyCount?: number;
  isChannel?: boolean;
  userChatUser1Id?: string;
  userChatUser2Id?: string;
  isPinned?: boolean;
  showReply?: boolean;
  loadMediaEager?: boolean;
  groupPosition?: MessageGroupPosition;
  entityType?: string | null;
  isThreadSearchOutline?: boolean;
  threadSearchHighlightQuery?: string | null;
}

export interface MessageItemProps extends MessageRowConfig {
  message: ChatMessageWithStatus | ChatMessage;
  handlers: MessageRowHandlers;
  contextMenuState: ContextMenuState;
  onOpenContextMenu: (messageId: string, position: { x: number; y: number }) => void;
  onCloseContextMenu: () => void;
  suppressOpenReactionMotion?: boolean;
}

export type ParsedContentPart =
  | { type: 'mention'; content: string; userId?: string; display?: string }
  | { type: 'url'; content: string; url?: string; displayText?: string; urlType?: 'channel' | 'group' | 'game' | 'user-chat' | 'profile' | 'other' }
  | { type: 'text'; content: string };
