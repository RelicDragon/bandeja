import { createContext } from 'react';
import type { RefObject } from 'react';
import type { ChatContextType, ChatMessage, ChatMessageWithStatus, GroupChannel, UserChat } from '@/api/chat';
import type { ChatType, Game, Bug } from '@/types';
import type { MessageListHandle } from '@/components/MessageList';
import type { TranslationModalAutoTranslateProps } from '@/components/chat/TranslationLanguageModal';
import type { OptimisticMessagePayload } from '@/api/chat';
import type { SendQueuedParams } from '@/components/chat/useMessageInputSubmit';
import type { useGameChatDerived } from './useGameChatDerived';
import type { useGameChatPanels } from './useGameChatPanels';
import type { LoadContextOptions } from './useGameChatContext';
import type { GameChatFooterVariant } from './GameChatFooter';
import type { ThreadSessionScroll } from '@/services/chat/threadSession';

/** Thread UI surface: messages, send, reactions, scroll, pinned, permissions, footer. */
export interface ThreadViewValue {
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

  messages: ChatMessageWithStatus[];
  hasMoreMessages: boolean;
  isLoadingMessages: boolean;
  isInitialLoad: boolean;
  isThreadOpenSettling: boolean;
  isLoadingMore: boolean;
  isSwitchingChatType: boolean;
  loadMessages: (append?: boolean, chatTypeOverride?: ChatType) => Promise<boolean>;
  loadMoreMessages: () => void;
  messageListRef: RefObject<MessageListHandle | null>;
  initialScroll: ThreadSessionScroll | undefined;
  openPaintGeneration: number;
  threadScrollKey: string | null;

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

  replyTo: ChatMessage | null;
  editingMessage: ChatMessage | null;
  handleCancelReply: () => void;
  handleCancelEdit: () => void;
  handleMessageUpdated: (updated: ChatMessage) => void;
  handleEditMessage: (message: ChatMessage) => void;
  handleAddReaction: (messageId: string, emoji: string) => void;
  handleRemoveReaction: (messageId: string) => void;
  handleDeleteMessage: (messageId: string) => void;
  handleReplyMessage: (message: ChatMessage) => void;
  handlePollUpdated: (messageId: string, poll: import('@/api/chat').Poll) => void;
  handleForwardMessage: (message: ChatMessage) => Promise<void>;
  handleChatRequestRespond: (userChatId: string, allowed: boolean) => void;

  chatNearBottom: boolean;
  setChatNearBottom: (near: boolean) => void;
  scrollToBottomSmooth: () => void;
  handleScrollToMessage: (messageId: string) => void;

  pinnedMessages: ChatMessage[];
  pinnedMessagesOrdered: ChatMessage[];
  pinnedBarTopIndex: number;
  loadingScrollTargetId: string | null;
  handlePinnedBarClick: (messageId: string) => void;
  handlePinMessage: (message: ChatMessage) => Promise<void>;
  handleUnpinMessage: (messageId: string) => Promise<void>;

  derived: ReturnType<typeof useGameChatDerived>;
  footerVariant: GameChatFooterVariant | null;

  isBlockedByUser: boolean;
  isJoiningAsGuest: boolean;
  translateToLanguageForChat: string | null;
  setTranslateToLanguageForChat: (value: string | null) => void;
  autoTranslateForModal: TranslationModalAutoTranslateProps | null;
  handleJoinAsGuest: () => void;
  handleMessageSent: () => void;
  setUserChat: React.Dispatch<React.SetStateAction<UserChat | null>>;
  handleTranslateToLanguageChange: (value: string | null) => Promise<void>;
  handleGroupChannelUpdate: (() => void | Promise<void>) | undefined;

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
  handleLeaveChat: () => void;
  handleJoinChannel: () => void;
  handleChatTypeChange: (chatType: ChatType) => void;
  leaveModalLabels: { title: string; message: string; confirmText: string };
  isMuted: boolean;
  isTogglingMute: boolean;
  showLeaveConfirmation: boolean;
  setShowLeaveConfirmation: (open: boolean) => void;

  chatContainerRef: RefObject<HTMLDivElement | null>;
  showLoadingHeader: boolean;
  navigate: ReturnType<typeof import('react-router-dom').useNavigate>;
}

export const ThreadViewContext = createContext<ThreadViewValue | null>(null);
