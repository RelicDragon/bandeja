import { ChatMessage, ChatMessageWithStatus } from '@/api/chat';

export interface ContextMenuState {
  isOpen: boolean;
  messageId: string | null;
  position: { x: number; y: number };
}

export interface MessageItemProps {
  message: ChatMessageWithStatus | ChatMessage;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage) => void;
  onPollUpdated?: (messageId: string, updatedPoll: import('@/api/chat').Poll) => void;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  contextMenuState: ContextMenuState;
  onOpenContextMenu: (messageId: string, position: { x: number; y: number }) => void;
  onCloseContextMenu: () => void;
  allMessages?: ChatMessage[];
  onScrollToMessage?: (messageId: string) => void;
  disableReadTracking?: boolean;
  isChannel?: boolean;
  userChatUser1Id?: string;
  userChatUser2Id?: string;
  onChatRequestRespond?: (messageId: string, accepted: boolean) => void;
  isPinned?: boolean;
  onPin?: (message: ChatMessage) => void;
  onUnpin?: (messageId: string) => void;
}

export type ParsedContentPart =
  | { type: 'mention'; content: string; userId?: string; display?: string }
  | { type: 'url'; content: string; url?: string; displayText?: string }
  | { type: 'text'; content: string };
