import { createContext } from 'react';
import type { RefObject } from 'react';
import type { ChatContextType, ChatMessage, ChatMessageWithStatus, GroupChannel, UserChat } from '@/api/chat';
import type { ChatType, Game, Bug } from '@/types';
import type { MessageListHandle } from '@/components/MessageList';
import type { TranslationModalAutoTranslateProps } from '@/components/chat/TranslationLanguageModal';
import type { OptimisticMessagePayload } from '@/api/chat';
import type { SendQueuedParams } from '@/components/chat/useMessageInputSubmit';
import type { useThreadDerived } from '@/services/chat/chatThreadController/useThreadDerived';
import type { useGameChatPanels } from './useGameChatPanels';
import type { LoadContextOptions } from './useGameChatContext';
import type { GameChatFooterVariant } from './GameChatFooter';
import type { ThreadSessionScroll } from '@/services/chat/threadSession';
import type { ThreadSearchValue } from './useThreadSearch';

export type { ThreadSearchValue } from './useThreadSearch';

/** Stable handlers — omit message array so composer does not re-render on row patches. */
export interface ThreadMessageActionsValue {
  loadMessages: (append?: boolean, chatTypeOverride?: ChatType) => Promise<boolean>;
  loadMoreMessages: () => void;
  handleAddOptimisticMessage: (
    payload: OptimisticMessagePayload,
    pendingImageBlobs?: Blob[],
    pendingVoiceBlob?: Blob,
    pendingVideoBlob?: Blob,
    pendingVideoPosterBlob?: Blob,
    videoTranscodeMs?: number
  ) => string;
  handleSendQueued: (params: SendQueuedParams) => void;
  handleSendFailed: (optimisticId: string) => void;
  handleReplaceOptimisticWithServerMessage: (optimisticId: string, serverMessage: ChatMessage) => void;
  handleResendQueued: (messageId: string) => void;
  handleRemoveFromQueue: (messageId: string) => void;
  handleAddReaction: (messageId: string, emoji: string) => void;
  handleRemoveReaction: (messageId: string) => void;
  handleDeleteMessage: (messageId: string) => void;
  handleReplyMessage: (message: ChatMessage) => void;
  handleEditMessage: (message: ChatMessage) => void;
  handlePollUpdated: (messageId: string, poll: import('@/api/chat').Poll) => void;
  handleForwardMessage: (message: ChatMessage) => Promise<void>;
  handleChatRequestRespond: (userChatId: string, allowed: boolean) => void;
  handleMessageUpdated: (updated: ChatMessage) => void;
  handlePinMessage: (message: ChatMessage) => Promise<void>;
  handleUnpinMessage: (messageId: string) => Promise<void>;
}

export interface ThreadMessagesDataValue {
  messages: ChatMessageWithStatus[];
  hasMoreMessages: boolean;
  isLoadingMessages: boolean;
  isInitialLoad: boolean;
  isThreadOpenSettling: boolean;
  isLoadingMore: boolean;
  isSwitchingChatType: boolean;
}

export interface ThreadMessagesValue extends ThreadMessageActionsValue, ThreadMessagesDataValue {}

export interface ThreadScrollValue {
  setChatNearBottom: (near: boolean) => void;
  subscribeChatNearBottom: (listener: () => void) => () => void;
  getChatNearBottom: () => boolean;
  scrollToBottomSmooth: () => void;
  handleScrollToMessage: (messageId: string) => void;
  scrollToMessageId: (messageId: string) => Promise<void>;
  messageListRef: RefObject<MessageListHandle | null>;
  initialScroll: ThreadSessionScroll | undefined;
  openPaintGeneration: number;
  threadScrollKey: string | null;
  highlightAnchorMessageId?: string;
}

export interface ThreadComposerValue {
  id: string | undefined;
  contextType: ChatContextType;
  currentChatType: ChatType;
  game: Game | null;
  bug: Bug | null;
  userChat: UserChat | null;
  groupChannel: GroupChannel | null;
  replyTo: ChatMessage | null;
  editingMessage: ChatMessage | null;
  handleCancelReply: () => void;
  handleCancelEdit: () => void;
  handleMessageSent: () => void;
  handleGroupChannelUpdate: (() => void | Promise<void>) | undefined;
  translateToLanguageForChat: string | null;
  handleTranslateToLanguageChange: (value: string | null) => Promise<void>;
  autoTranslateForModal: TranslationModalAutoTranslateProps | null;
  lastOwnMessage: ChatMessage | null | undefined;
  footerVariant: GameChatFooterVariant | null;
  isJoiningAsGuest: boolean;
  handleJoinAsGuest: () => void;
  setUserChat: React.Dispatch<React.SetStateAction<UserChat | null>>;
  hasMessages: boolean;
  isChannel: boolean;
}

export interface ThreadChromeValue {
  id: string | undefined;
  contextType: ChatContextType;
  effectiveChatType: ChatType;
  currentChatType: ChatType;
  isEmbedded: boolean;
  game: Game | null;
  bug: Bug | null;
  userChat: UserChat | null;
  groupChannel: GroupChannel | null;
  setGroupChannel: React.Dispatch<React.SetStateAction<GroupChannel | null>>;
  groupChannelParticipantsCount: number;
  setGroupChannelParticipantsCount: React.Dispatch<React.SetStateAction<number>>;
  isLoadingContext: boolean;
  loadContext: (options?: LoadContextOptions) => Promise<unknown>;
  pinnedMessages: ChatMessage[];
  pinnedMessagesOrdered: ChatMessage[];
  pinnedBarTopIndex: number;
  loadingScrollTargetId: string | null;
  handlePinnedBarClick: (messageId: string) => void;
  derived: ReturnType<typeof useThreadDerived>;
  footerVariant: GameChatFooterVariant | null;
  effectiveFooterVariant: GameChatFooterVariant | null;
  isBlockedByUser: boolean;
  isJoiningAsGuest: boolean;
  title: string;
  titleContent: React.ReactNode;
  titleMetaRow: React.ReactNode;
  subtitle: string | null;
  icon: React.ReactNode;
  panels: ReturnType<typeof useGameChatPanels>;
  failedMutationCount: number;
  retryMutations: () => void;
  autoTranslateLanguageCodes: string[];
  handleToggleMute: () => void;
  handleLeaveClick: () => void;
  handleLeaveChat: () => void;
  handleDeclineInviteFromChat: (message?: string) => Promise<void>;
  handleJoinChannel: () => void;
  handleChatTypeChange: (chatType: ChatType) => void;
  leaveModalLabels: { title: string; message: string; confirmText: string };
  isMuted: boolean;
  isTogglingMute: boolean;
  isLeavingChat: boolean;
  showLeaveConfirmation: boolean;
  setShowLeaveConfirmation: (open: boolean) => void;
  showDeclineInviteModal: boolean;
  setShowDeclineInviteModal: (open: boolean) => void;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  showLoadingHeader: boolean;
  navigate: ReturnType<typeof import('react-router-dom').useNavigate>;
  isThreadOpenSettling: boolean;
  isInitialLoad: boolean;
  isSwitchingChatType: boolean;
}

/** Controller return shape — consumers should use seam hooks. */
export interface ThreadViewValue
  extends ThreadMessagesValue,
    ThreadScrollValue,
    ThreadComposerValue,
    ThreadChromeValue {}

export const ThreadMessageActionsContext = createContext<ThreadMessageActionsValue | null>(null);
export const ThreadMessagesDataContext = createContext<ThreadMessagesDataValue | null>(null);
export const ThreadMessagesContext = createContext<ThreadMessagesValue | null>(null);
export const ThreadScrollContext = createContext<ThreadScrollValue | null>(null);
export const ThreadComposerContext = createContext<ThreadComposerValue | null>(null);
export const ThreadChromeContext = createContext<ThreadChromeValue | null>(null);
export const ThreadSearchContext = createContext<ThreadSearchValue | null>(null);
