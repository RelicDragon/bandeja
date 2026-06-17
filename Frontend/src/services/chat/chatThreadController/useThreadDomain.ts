import { useEffect, useMemo, type RefObject } from 'react';
import type { ChatContextType, ChatMessageWithStatus, GroupChannel, UserChat } from '@/api/chat';
import type { ChatType, Game } from '@/types';
import type { MessageListHandle } from '@/components/MessageList';
import type { TranslationModalAutoTranslateProps } from '@/components/chat/TranslationLanguageModal';
import { useThreadChannelActivity } from './useThreadChannelActivity';
import { gameChatChannelIsActive, chatMessageActivatesGameChannel } from '@/utils/gameChatChannelActivity';
import { useThreadDerived } from './useThreadDerived';
import { useThreadAutoTranslate } from './useThreadAutoTranslate';
import { useThreadTranslationLive } from './useThreadTranslationLive';
import { useThreadPinned } from './useThreadPinned';
import { useThreadReactions } from './useThreadReactions';
import { useThreadFooterVariant } from './useThreadFooterVariant';
import type { ChatThreadSocketHandlers } from './useChatThreadController';

export interface UseThreadDomainParams {
  id: string | undefined;
  contextType: ChatContextType;
  currentChatType: ChatType;
  effectiveChatType: ChatType;
  game: Game | null;
  groupChannel: GroupChannel | null;
  userChat: UserChat | null;
  user: { id: string; language?: string | null; isAdmin?: boolean | null } | null;
  messages: ChatMessageWithStatus[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  setUserChat: React.Dispatch<React.SetStateAction<UserChat | null>>;
  setCurrentChatType: (t: ChatType) => void;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  messageListRef: RefObject<MessageListHandle | null>;
  loadMessagesBeforeMessageId: (messageId: string) => Promise<boolean>;
  isBlockedByUser: boolean;
  isJoiningAsGuest: boolean;
  socketHandlersRef: React.MutableRefObject<ChatThreadSocketHandlers | null>;
}

export function useThreadDomain(params: UseThreadDomainParams) {
  const {
    id,
    contextType,
    currentChatType,
    effectiveChatType,
    game,
    groupChannel,
    userChat,
    user,
    messages,
    setMessages,
    messagesRef,
    setUserChat,
    setCurrentChatType,
    chatContainerRef,
    messageListRef,
    loadMessagesBeforeMessageId,
    isBlockedByUser,
    isJoiningAsGuest,
    socketHandlersRef,
  } = params;

  const { channelActivity, channelActivityResolved, noteUserMessage } = useThreadChannelActivity(
    contextType === 'GAME' ? game : null,
    user?.id
  );

  const derived = useThreadDerived({
    game,
    groupChannel,
    user,
    contextType,
    currentChatType,
    messages,
    channelActivity: contextType === 'GAME' ? channelActivity : undefined,
  });

  useEffect(() => {
    if (contextType !== 'GAME' || !channelActivityResolved) return;
    if (!derived.availableChatTypes.includes(currentChatType)) {
      setCurrentChatType('PUBLIC');
    }
  }, [contextType, channelActivityResolved, derived.availableChatTypes, currentChatType, setCurrentChatType]);

  useEffect(() => {
    if (contextType !== 'GAME') return;
    if (effectiveChatType !== 'PRIVATE' && effectiveChatType !== 'ADMINS') return;
    if (!gameChatChannelIsActive(messages, effectiveChatType)) return;
    const activating = messages.find(
      (m) => chatMessageActivatesGameChannel(m) === effectiveChatType
    );
    if (activating) noteUserMessage(activating);
  }, [contextType, effectiveChatType, messages, noteUserMessage]);

  const autoTranslate = useThreadAutoTranslate({
    id,
    contextType,
    effectiveChatType,
    userId: user?.id,
    userIsAdmin: user?.isAdmin,
    groupChannel,
    game,
    userChat,
    bugSenderId: groupChannel?.bug?.senderId,
  });

  useThreadTranslationLive({
    id,
    contextType,
    effectiveChatType,
    userLanguage: user?.language,
    setMessages,
    messagesRef,
    onAutoTranslateConfigFromSocket: autoTranslate.setAutoTranslateFromSocket,
  });

  const {
    replyTo,
    editingMessage,
    setReplyTo,
    setEditingMessage,
    handleAddReaction,
    handleRemoveReaction,
    handlePollUpdated,
    handleDeleteMessage,
    handleReplyMessage,
    handleCancelReply,
    handleEditMessage,
    handleCancelEdit,
    handleMessageUpdated,
    handleMessageReaction,
    handleReadReceipt,
    handleMessageDeleted,
    handleChatRequestRespond,
  } = useThreadReactions({ id, contextType, user, setMessages, messagesRef, setUserChat });

  const {
    pinnedMessages,
    pinnedMessagesOrdered,
    pinnedBarTopIndex,
    loadingScrollTargetId,
    fetchPinnedMessages,
    handleScrollToMessage,
    handlePinnedBarClick,
    handlePinMessage,
    handleUnpinMessage,
  } = useThreadPinned({
    id,
    contextType,
    effectiveChatType,
    canAccessChat: !!derived.canAccessChat,
    chatContainerRef,
    messageListRef,
    loadMessagesBeforeMessageId,
    messagesRef,
  });

  socketHandlersRef.current = {
    handleMessageReaction,
    handleReadReceipt,
    handleMessageDeleted,
    fetchPinnedMessages,
    handleMessageUpdated,
  };

  const footerVariant = useThreadFooterVariant({
    id,
    contextType,
    isBlockedByUser,
    userChat,
    userId: user?.id,
    canAccessChat: !!derived.canAccessChat,
    canWriteChat: !!derived.canWriteChat,
    isChannelParticipantOnly: !!derived.isChannelParticipantOnly,
    game,
    groupChannel,
    isInJoinQueue: !!derived.isInJoinQueue,
    isChannelParticipant: !!derived.isChannelParticipant,
    isChannel: !!derived.isChannel,
    isJoiningAsGuest,
  });

  const autoTranslateForModal = useMemo((): TranslationModalAutoTranslateProps | null => {
    if (!id) return null;
    return {
      languageCodes: autoTranslate.autoTranslateConfig?.languageCodes ?? [],
      maxSlots: autoTranslate.autoTranslateConfig?.maxSlots ?? autoTranslate.effectiveMaxSlots,
      canEdit: autoTranslate.canEditAutoTranslate,
      onChange: autoTranslate.applyAutoTranslateLanguageCodes,
    };
  }, [
    id,
    autoTranslate.autoTranslateConfig?.languageCodes,
    autoTranslate.autoTranslateConfig?.maxSlots,
    autoTranslate.effectiveMaxSlots,
    autoTranslate.canEditAutoTranslate,
    autoTranslate.applyAutoTranslateLanguageCodes,
  ]);

  return {
    derived,
    channelActivity,
    channelActivityResolved,
    noteUserMessage,
    autoTranslate,
    autoTranslateForModal,
    footerVariant,
    pinnedMessages,
    pinnedMessagesOrdered,
    pinnedBarTopIndex,
    loadingScrollTargetId,
    handleScrollToMessage,
    handlePinnedBarClick,
    handlePinMessage,
    handleUnpinMessage,
    replyTo,
    editingMessage,
    setReplyTo,
    setEditingMessage,
    handleAddReaction,
    handleRemoveReaction,
    handlePollUpdated,
    handleDeleteMessage,
    handleReplyMessage,
    handleCancelReply,
    handleEditMessage,
    handleCancelEdit,
    handleMessageUpdated,
    handleChatRequestRespond,
    onInboundMessage: contextType === 'GAME' ? noteUserMessage : undefined,
  };
}
