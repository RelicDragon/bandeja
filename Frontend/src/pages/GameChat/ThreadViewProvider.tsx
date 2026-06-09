import { useMemo, type ReactNode } from 'react';
import type { GameChatProps } from './types';
import {
  ThreadChromeContext,
  ThreadComposerContext,
  ThreadMessageActionsContext,
  ThreadMessagesContext,
  ThreadMessagesDataContext,
  ThreadScrollContext,
} from './ThreadViewContext';
import { useThreadViewController } from './useThreadViewController';
import { isThreadComposerInitializing } from './threadViewLoadingState';

export function ThreadViewProvider({ children, ...props }: GameChatProps & { children: ReactNode }) {
  const ctrl = useThreadViewController(props);

  const messageActions = useMemo(
    (): import('./ThreadViewContext').ThreadMessageActionsValue => ({
      loadMessages: ctrl.loadMessages,
      loadMoreMessages: ctrl.loadMoreMessages,
      handleAddOptimisticMessage: ctrl.handleAddOptimisticMessage,
      handleSendQueued: ctrl.handleSendQueued,
      handleSendFailed: ctrl.handleSendFailed,
      handleReplaceOptimisticWithServerMessage: ctrl.handleReplaceOptimisticWithServerMessage,
      handleResendQueued: ctrl.handleResendQueued,
      handleRemoveFromQueue: ctrl.handleRemoveFromQueue,
      handleAddReaction: ctrl.handleAddReaction,
      handleRemoveReaction: ctrl.handleRemoveReaction,
      handleDeleteMessage: ctrl.handleDeleteMessage,
      handleReplyMessage: ctrl.handleReplyMessage,
      handleEditMessage: ctrl.handleEditMessage,
      handlePollUpdated: ctrl.handlePollUpdated,
      handleForwardMessage: ctrl.handleForwardMessage,
      handleChatRequestRespond: ctrl.handleChatRequestRespond,
      handleMessageUpdated: ctrl.handleMessageUpdated,
      handlePinMessage: ctrl.handlePinMessage,
      handleUnpinMessage: ctrl.handleUnpinMessage,
    }),
    [
      ctrl.loadMessages,
      ctrl.loadMoreMessages,
      ctrl.handleAddOptimisticMessage,
      ctrl.handleSendQueued,
      ctrl.handleSendFailed,
      ctrl.handleReplaceOptimisticWithServerMessage,
      ctrl.handleResendQueued,
      ctrl.handleRemoveFromQueue,
      ctrl.handleAddReaction,
      ctrl.handleRemoveReaction,
      ctrl.handleDeleteMessage,
      ctrl.handleReplyMessage,
      ctrl.handleEditMessage,
      ctrl.handlePollUpdated,
      ctrl.handleForwardMessage,
      ctrl.handleChatRequestRespond,
      ctrl.handleMessageUpdated,
      ctrl.handlePinMessage,
      ctrl.handleUnpinMessage,
    ]
  );

  const messageData = useMemo(
    (): import('./ThreadViewContext').ThreadMessagesDataValue => ({
      messages: ctrl.messages,
      hasMoreMessages: ctrl.hasMoreMessages,
      isLoadingMessages: ctrl.isLoadingMessages,
      isInitialLoad: ctrl.isInitialLoad,
      isThreadOpenSettling: ctrl.isThreadOpenSettling,
      isLoadingMore: ctrl.isLoadingMore,
      isSwitchingChatType: ctrl.isSwitchingChatType,
    }),
    [
      ctrl.messages,
      ctrl.hasMoreMessages,
      ctrl.isLoadingMessages,
      ctrl.isInitialLoad,
      ctrl.isThreadOpenSettling,
      ctrl.isLoadingMore,
      ctrl.isSwitchingChatType,
    ]
  );

  const messages = useMemo(
    (): import('./ThreadViewContext').ThreadMessagesValue => ({
      ...messageActions,
      ...messageData,
    }),
    [messageActions, messageData]
  );

  const scroll = useMemo(
    (): import('./ThreadViewContext').ThreadScrollValue => ({
      setChatNearBottom: ctrl.setChatNearBottom,
      subscribeChatNearBottom: ctrl.subscribeChatNearBottom,
      getChatNearBottom: ctrl.getChatNearBottom,
      scrollToBottomSmooth: ctrl.scrollToBottomSmooth,
      handleScrollToMessage: ctrl.handleScrollToMessage,
      messageListRef: ctrl.messageListRef,
      initialScroll: ctrl.initialScroll,
      openPaintGeneration: ctrl.openPaintGeneration,
      threadScrollKey: ctrl.threadScrollKey,
    }),
    [
      ctrl.setChatNearBottom,
      ctrl.subscribeChatNearBottom,
      ctrl.getChatNearBottom,
      ctrl.scrollToBottomSmooth,
      ctrl.handleScrollToMessage,
      ctrl.messageListRef,
      ctrl.initialScroll,
      ctrl.openPaintGeneration,
      ctrl.threadScrollKey,
    ]
  );

  const composer = useMemo(
    (): import('./ThreadViewContext').ThreadComposerValue => ({
      id: ctrl.id,
      contextType: ctrl.contextType,
      currentChatType: ctrl.currentChatType,
      game: ctrl.game,
      bug: ctrl.bug,
      userChat: ctrl.userChat,
      groupChannel: ctrl.groupChannel,
      replyTo: ctrl.replyTo,
      editingMessage: ctrl.editingMessage,
      handleCancelReply: ctrl.handleCancelReply,
      handleCancelEdit: ctrl.handleCancelEdit,
      handleMessageSent: ctrl.handleMessageSent,
      handleGroupChannelUpdate: ctrl.handleGroupChannelUpdate,
      translateToLanguageForChat: ctrl.translateToLanguageForChat,
      handleTranslateToLanguageChange: ctrl.handleTranslateToLanguageChange,
      autoTranslateForModal: ctrl.autoTranslateForModal,
      lastOwnMessage: ctrl.derived.lastOwnMessage,
      footerVariant: ctrl.footerVariant,
      isJoiningAsGuest: ctrl.isJoiningAsGuest,
      handleJoinAsGuest: ctrl.handleJoinAsGuest,
      setUserChat: ctrl.setUserChat,
      hasMessages: ctrl.messages.length > 0,
      isChannel: ctrl.derived.isChannel,
    }),
    [
      ctrl.id,
      ctrl.contextType,
      ctrl.currentChatType,
      ctrl.game,
      ctrl.bug,
      ctrl.userChat,
      ctrl.groupChannel,
      ctrl.replyTo,
      ctrl.editingMessage,
      ctrl.handleCancelReply,
      ctrl.handleCancelEdit,
      ctrl.handleMessageSent,
      ctrl.handleGroupChannelUpdate,
      ctrl.translateToLanguageForChat,
      ctrl.handleTranslateToLanguageChange,
      ctrl.autoTranslateForModal,
      ctrl.derived.lastOwnMessage,
      ctrl.footerVariant,
      ctrl.isJoiningAsGuest,
      ctrl.handleJoinAsGuest,
      ctrl.setUserChat,
      ctrl.messages.length,
      ctrl.derived.isChannel,
    ]
  );

  const chrome = useMemo(
    (): import('./ThreadViewContext').ThreadChromeValue => ({
      id: ctrl.id,
      contextType: ctrl.contextType,
      effectiveChatType: ctrl.effectiveChatType,
      currentChatType: ctrl.currentChatType,
      isEmbedded: ctrl.isEmbedded,
      game: ctrl.game,
      bug: ctrl.bug,
      userChat: ctrl.userChat,
      groupChannel: ctrl.groupChannel,
      setGroupChannel: ctrl.setGroupChannel,
      groupChannelParticipantsCount: ctrl.groupChannelParticipantsCount,
      setGroupChannelParticipantsCount: ctrl.setGroupChannelParticipantsCount,
      isLoadingContext: ctrl.isLoadingContext,
      loadContext: ctrl.loadContext,
      pinnedMessages: ctrl.pinnedMessages,
      pinnedMessagesOrdered: ctrl.pinnedMessagesOrdered,
      pinnedBarTopIndex: ctrl.pinnedBarTopIndex,
      loadingScrollTargetId: ctrl.loadingScrollTargetId,
      handlePinnedBarClick: ctrl.handlePinnedBarClick,
      derived: ctrl.derived,
      footerVariant: ctrl.footerVariant,
      effectiveFooterVariant:
        ctrl.footerVariant?.type === 'input' &&
        isThreadComposerInitializing(
          ctrl.isLoadingMessages,
          ctrl.isInitialLoad,
          ctrl.isThreadOpenSettling,
        )
          ? ({ type: 'contextLoading' } as const)
          : ctrl.footerVariant,
      isBlockedByUser: ctrl.isBlockedByUser,
      isJoiningAsGuest: ctrl.isJoiningAsGuest,
      title: ctrl.title,
      titleContent: ctrl.titleContent,
      titleMetaRow: ctrl.titleMetaRow,
      subtitle: ctrl.subtitle,
      icon: ctrl.icon,
      panels: ctrl.panels,
      failedMutationCount: ctrl.failedMutationCount,
      retryMutations: ctrl.retryMutations,
      autoTranslateLanguageCodes: ctrl.autoTranslateLanguageCodes,
      handleToggleMute: ctrl.handleToggleMute,
      handleLeaveClick: ctrl.handleLeaveClick,
      handleLeaveChat: ctrl.handleLeaveChat,
      handleDeclineInviteFromChat: ctrl.handleDeclineInviteFromChat,
      handleJoinChannel: ctrl.handleJoinChannel,
      handleChatTypeChange: ctrl.handleChatTypeChange,
      leaveModalLabels: ctrl.leaveModalLabels,
      isMuted: ctrl.isMuted,
      isTogglingMute: ctrl.isTogglingMute,
      isLeavingChat: ctrl.isLeavingChat,
      showLeaveConfirmation: ctrl.showLeaveConfirmation,
      setShowLeaveConfirmation: ctrl.setShowLeaveConfirmation,
      showDeclineInviteModal: ctrl.showDeclineInviteModal,
      setShowDeclineInviteModal: ctrl.setShowDeclineInviteModal,
      chatContainerRef: ctrl.chatContainerRef,
      showLoadingHeader: ctrl.showLoadingHeader,
      navigate: ctrl.navigate,
      isThreadOpenSettling: ctrl.isThreadOpenSettling,
      isInitialLoad: ctrl.isInitialLoad,
      isSwitchingChatType: ctrl.isSwitchingChatType,
    }),
    [
      ctrl.id,
      ctrl.contextType,
      ctrl.effectiveChatType,
      ctrl.currentChatType,
      ctrl.isEmbedded,
      ctrl.game,
      ctrl.bug,
      ctrl.userChat,
      ctrl.groupChannel,
      ctrl.setGroupChannel,
      ctrl.groupChannelParticipantsCount,
      ctrl.setGroupChannelParticipantsCount,
      ctrl.isLoadingContext,
      ctrl.loadContext,
      ctrl.pinnedMessages,
      ctrl.pinnedMessagesOrdered,
      ctrl.pinnedBarTopIndex,
      ctrl.loadingScrollTargetId,
      ctrl.handlePinnedBarClick,
      ctrl.derived,
      ctrl.footerVariant,
      ctrl.isLoadingMessages,
      ctrl.isInitialLoad,
      ctrl.isThreadOpenSettling,
      ctrl.isBlockedByUser,
      ctrl.isJoiningAsGuest,
      ctrl.title,
      ctrl.titleContent,
      ctrl.titleMetaRow,
      ctrl.subtitle,
      ctrl.icon,
      ctrl.panels,
      ctrl.failedMutationCount,
      ctrl.retryMutations,
      ctrl.autoTranslateLanguageCodes,
      ctrl.handleToggleMute,
      ctrl.handleLeaveClick,
      ctrl.handleLeaveChat,
      ctrl.handleDeclineInviteFromChat,
      ctrl.handleJoinChannel,
      ctrl.handleChatTypeChange,
      ctrl.leaveModalLabels,
      ctrl.isMuted,
      ctrl.isTogglingMute,
      ctrl.isLeavingChat,
      ctrl.showLeaveConfirmation,
      ctrl.setShowLeaveConfirmation,
      ctrl.showDeclineInviteModal,
      ctrl.setShowDeclineInviteModal,
      ctrl.chatContainerRef,
      ctrl.showLoadingHeader,
      ctrl.navigate,
      ctrl.isSwitchingChatType,
    ]
  );

  return (
    <ThreadMessageActionsContext.Provider value={messageActions}>
      <ThreadMessagesDataContext.Provider value={messageData}>
        <ThreadMessagesContext.Provider value={messages}>
          <ThreadScrollContext.Provider value={scroll}>
            <ThreadComposerContext.Provider value={composer}>
              <ThreadChromeContext.Provider value={chrome}>{children}</ThreadChromeContext.Provider>
            </ThreadComposerContext.Provider>
          </ThreadScrollContext.Provider>
        </ThreadMessagesContext.Provider>
      </ThreadMessagesDataContext.Provider>
    </ThreadMessageActionsContext.Provider>
  );
}
