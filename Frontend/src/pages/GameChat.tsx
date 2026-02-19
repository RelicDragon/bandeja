import React, { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { chatApi, ChatMessage, ChatMessageWithStatus, ChatContextType, UserChat as UserChatType, OptimisticMessagePayload, GroupChannel } from '@/api/chat';
import { gamesApi } from '@/api/games';
import { blockedUsersApi } from '@/api/blockedUsers';
import { Game, ChatType, Bug } from '@/types';
import { MessageList } from '@/components/MessageList';
import { MessageInput } from '@/components/MessageInput';
import { ChatParticipantsModal } from '@/components/ChatParticipantsModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { usePlayersStore } from '@/store/playersStore';
import { useNavigationStore } from '@/store/navigationStore';
import { formatDate } from '@/utils/dateFormat';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { getGameTimeDisplay } from '@/utils/gameTimeDisplay';
import { socketService } from '@/services/socketService';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { isGroupChannelOwner, isGroupChannelAdminOrOwner } from '@/utils/gameResults';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import { normalizeChatType, getAvailableGameChatTypes } from '@/utils/chatType';
import { parseSystemMessage } from '@/utils/systemMessages';
import { MessageCircle, ArrowLeft, MapPin, Camera, Bug as BugIcon, Users, Hash, Package } from 'lucide-react';
import { GroupChannelSettings } from '@/components/chat/GroupChannelSettings';
import { ChatHeaderActions } from '@/components/chat/ChatHeaderActions';
import { JoinGroupChannelButton } from '@/components/JoinGroupChannelButton';
import { ChatContextPanel } from '@/components/chat/contextPanels';
import { PinnedMessagesBar } from '@/components/chat/PinnedMessagesBar';
import { MarketItemPanel } from '@/components/marketplace';
import { PlayerCardBottomSheet } from '@/components/PlayerCardBottomSheet';
import { RequestToChat } from '@/components/chat/RequestToChat';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { handleBack } from '@/utils/backNavigation';
import { messageQueueStorage } from '@/services/chatMessageQueueStorage';
import { sendWithTimeout, cancelSend, resend, cancelAllForContext } from '@/services/chatSendService';
import { applyQueuedMessagesToState } from '@/services/applyQueuedMessagesToState';
import { isCapacitor } from '@/utils/capacitor';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { AnimatePresence, motion } from 'framer-motion';

interface LocationState {
  initialChatType?: ChatType;
  contextType?: ChatContextType;
  chat?: UserChatType;
  forceReload?: number;
  fromExpressInterest?: boolean;
}

interface GameChatProps {
  isEmbedded?: boolean;
  chatId?: string;
  chatType?: 'user' | 'bug' | 'game' | 'group' | 'channel';
}

export const GameChat: React.FC<GameChatProps> = ({ isEmbedded = false, chatId: propChatId, chatType: propChatType }) => {
  const { t } = useTranslation();
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { setBottomTabsVisible, setChatsFilter } = useNavigationStore();
  
  const id = isEmbedded ? propChatId : paramId;
  
  const locationState = location.state as LocationState | null;
  const contextType: ChatContextType = isEmbedded
    ? (propChatType === 'user' ? 'USER' : (propChatType === 'group' || propChatType === 'channel') ? 'GROUP' : 'GAME')
    : (locationState?.contextType ||
      (location.pathname.includes('/user-chat/') ? 'USER' :
       (location.pathname.includes('/group-chat/') || location.pathname.includes('/channel-chat/') || location.pathname.match(/^\/bugs\/[^/]+$/)) ? 'GROUP' : 'GAME'));
  const initialChatType = locationState?.initialChatType;
  
  const [game, setGame] = useState<Game | null>(null);
  const [bug, setBug] = useState<Bug | null>(null);
  const [userChat, setUserChat] = useState<UserChatType | null>(locationState?.chat || null);
  const [groupChannel, setGroupChannel] = useState<GroupChannel | null>(null);
  const [groupChannelParticipantsCount, setGroupChannelParticipantsCount] = useState<number>(0);
  const [messages, setMessages] = useState<ChatMessageWithStatus[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSwitchingChatType, setIsSwitchingChatType] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [showParticipantsPage, setShowParticipantsPage] = useState(false);
  const [isParticipantsPageAnimating, setIsParticipantsPageAnimating] = useState(false);
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);
  const [currentChatType, setCurrentChatType] = useState<ChatType>(initialChatType || 'PUBLIC');
  const [isLoadingContext, setIsLoadingContext] = useState(!isEmbedded);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [isLeavingChat, setIsLeavingChat] = useState(false);
  const [isBlockedByUser, setIsBlockedByUser] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [hasSetDefaultChatType, setHasSetDefaultChatType] = useState(false);
  const [showPlayerCard, setShowPlayerCard] = useState(false);
  const [showItemPage, setShowItemPage] = useState(false);
  const [isItemPageAnimating, setIsItemPageAnimating] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [pinnedBarTopIndex, setPinnedBarTopIndex] = useState(0);
  const [loadingScrollTargetId, setLoadingScrollTargetId] = useState<string | null>(null);
  const justLoadedOlderMessagesRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const previousIdRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef<ChatMessageWithStatus[]>([]);
  const loadingIdRef = useRef<string | undefined>(undefined);
  const hasLoadedRef = useRef(false);
  const handleNewMessageRef = useRef<(message: ChatMessage) => string | void>(() => {});

  const participation = getGameParticipationState(game?.participants ?? [], user?.id, game ?? undefined);
  const { userParticipant, isParticipant, isPlaying: isPlayingParticipant, isAdminOrOwner, hasPendingInvite, isGuest, isInJoinQueue } = participation;

  const contextKey = useMemo(() => (id ? `${contextType}:${id}` : ''), [contextType, id]);
  const missedForContext = useChatSyncStore((s) => (contextKey ? s.missedMessagesByContext[contextKey] ?? [] : []));

  const isBugChat = contextType === 'GROUP' && !!groupChannel?.bug;
  const isBugCreator = groupChannel?.bug?.senderId === user?.id;
  const isBugAdmin = user?.isAdmin;
  const isBugParticipant = groupChannel?.participants?.some((p) => p.userId === user?.id) ?? false;
  const isBugChatParticipant = isBugChat && bug && (isBugParticipant || isBugCreator || isBugAdmin);
  
  const isChannelOwner = contextType === 'GROUP' && groupChannel && user ? isGroupChannelOwner(groupChannel, user.id) : false;
  const isChannelAdminOrOwner = contextType === 'GROUP' && groupChannel && user ? isGroupChannelAdminOrOwner(groupChannel, user.id) : false;
  const isChannelParticipant = contextType === 'GROUP' && groupChannel && (groupChannel.isParticipant || isChannelOwner);
  const isChannel = contextType === 'GROUP' && groupChannel?.isChannel;
  const isChannelParticipantOnly = isChannel && isChannelParticipant && !isChannelAdminOrOwner;
  const isItemChat = contextType === 'GROUP' && !!groupChannel?.marketItem;

  const showMute = useMemo(() => !!(
    (contextType === 'GAME' && isParticipant) ||
    isBugChatParticipant ||
    contextType === 'USER' ||
    (contextType === 'GROUP' && groupChannel && isChannelParticipant)
  ), [contextType, isParticipant, isBugChatParticipant, groupChannel, isChannelParticipant]);

  const showLeave = useMemo(() => !!(
    (contextType === 'GAME' && isParticipant && isGuest && game?.entityType !== 'LEAGUE') ||
    (isBugChatParticipant && !isBugCreator) ||
    (contextType === 'GROUP' && groupChannel && !isBugChat && isChannelParticipant && !isChannelOwner)
  ), [contextType, isParticipant, isGuest, game?.entityType, isBugChatParticipant, isBugCreator, groupChannel, isBugChat, isChannelParticipant, isChannelOwner]);

  const showHeaderActions = showMute || showLeave || contextType === 'GAME';

  const leaveTitle = useMemo(() => {
    if (contextType === 'GROUP' && groupChannel) {
      return groupChannel.isChannel
        ? t('chat.leaveChannel', { defaultValue: 'Leave Channel' })
        : t('chat.leaveGroup', { defaultValue: 'Leave Group' });
    }
    return t('chat.leave');
  }, [contextType, groupChannel, t]);

  const canWriteGroupChat = useMemo(() => {
    if (contextType !== 'GROUP' || !groupChannel || !user?.id) return false;
    
    if (isChannel) {
      return isChannelAdminOrOwner;
    } else {
      return isChannelParticipant;
    }
  }, [contextType, groupChannel, user?.id, isChannel, isChannelAdminOrOwner, isChannelParticipant]);
  
  const parentParticipantEntry = game?.parent?.participants?.find(p => p.userId === user?.id);
  const isParentAdminOrOwner = parentParticipantEntry?.role === 'OWNER' || parentParticipantEntry?.role === 'ADMIN';
  const isParentParticipant = !!parentParticipantEntry;
  const hasPrivateAccess = isPlayingParticipant || userParticipant?.status === 'NON_PLAYING' || isAdminOrOwner || isParentAdminOrOwner;
  const hasAdminsAccess = isAdminOrOwner || isParentAdminOrOwner;

  const canAccessChat = contextType === 'USER' ||
    (contextType === 'GAME' && (
      currentChatType === 'PUBLIC' ||
      currentChatType === 'PHOTOS' ||
      (currentChatType === 'PRIVATE' && hasPrivateAccess) ||
      (currentChatType === 'ADMINS' && hasAdminsAccess) ||
      isParticipant ||
      hasPendingInvite ||
      isGuest ||
      isAdminOrOwner
    )) ||
    (contextType === 'GROUP' && (isChannelParticipant || (isChannel && groupChannel?.isPublic)));

  const canWriteGameChat = useMemo(() => {
    if (contextType !== 'GAME' || !game || !user?.id) return false;

    if (currentChatType === 'PUBLIC') {
      return isParticipant || isAdminOrOwner || isParentParticipant;
    } else if (currentChatType === 'ADMINS') {
      return hasAdminsAccess;
    } else if (currentChatType === 'PRIVATE') {
      return hasPrivateAccess;
    } else if (currentChatType === 'PHOTOS') {
      return isPlayingParticipant || isAdminOrOwner;
    }
    return false;
  }, [contextType, game, user?.id, currentChatType, isParticipant, isAdminOrOwner, isPlayingParticipant, isParentParticipant, hasPrivateAccess, hasAdminsAccess]);
  
  const canWriteChat = useMemo(() => {
    if (contextType === 'GAME') return canWriteGameChat;
    if (contextType === 'GROUP') return canWriteGroupChat;
    if (contextType === 'USER') return true;
    return false;
  }, [contextType, canWriteGameChat, canWriteGroupChat]);

  const lastOwnMessage = useMemo(() => {
    if (!user?.id || messages.length === 0) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === user.id) return messages[i];
    }
    return null;
  }, [user?.id, messages]);

  const effectiveChatType = useMemo(
    () => (contextType === 'GAME' ? normalizeChatType(currentChatType) : 'PUBLIC') as ChatType,
    [contextType, currentChatType]
  );
  
  const canViewPublicChat = contextType === 'USER' || contextType === 'GROUP' || (contextType === 'GAME' && currentChatType === 'PUBLIC') || canAccessChat;

  const leaveModalLabels = useMemo(() => {
    if (contextType !== 'GAME' || !userParticipant) {
      return { title: t('chat.leave'), message: t('chat.leaveConfirmation'), confirmText: t('chat.leave') };
    }
    if (userParticipant.status === 'GUEST') {
      return { title: t('chat.leave'), message: t('chat.leaveConfirmation'), confirmText: t('chat.leave') };
    }
    if (userParticipant.status === 'INVITED') {
      return { title: t('chat.leaveDeclineInviteTitle'), message: t('chat.leaveDeclineInviteMessage'), confirmText: t('common.decline') };
    }
    if (userParticipant.status === 'IN_QUEUE') {
      return { title: t('chat.leaveCancelQueueTitle'), message: t('chat.leaveCancelQueueMessage'), confirmText: t('games.cancelJoinRequest', { defaultValue: 'Cancel' }) };
    }
    return { title: t('chat.leave'), message: t('chat.leaveConfirmation'), confirmText: t('chat.leave') };
  }, [contextType, userParticipant, t]);

  useEffect(() => {
    if (!isEmbedded) {
      setBottomTabsVisible(false);
      return () => {
        setBottomTabsVisible(true);
      };
    }
  }, [setBottomTabsVisible, isEmbedded]);

  useBackButtonHandler(() => {
    if (showItemPage) {
      setIsItemPageAnimating(true);
      setTimeout(() => setShowItemPage(false), 300);
      return true;
    }
    if (showParticipantsPage) {
      setIsParticipantsPageAnimating(true);
      setTimeout(() => {
        setShowParticipantsPage(false);
      }, 300);
      return true;
    }
    
    handleBack(navigate);
    
    return true;
  });

  useEffect(() => {
    if (!isEmbedded && !isLoadingContext && !game && !bug && !userChat && !groupChannel) {
      if (contextType === 'USER') {
        setChatsFilter('users');
        navigate('/chats', { replace: true });
      } else if (contextType === 'GROUP') {
        const isBugChat = location.pathname.match(/^\/bugs\/[^/]+$/);
        if (isBugChat) {
          setChatsFilter('bugs');
          navigate('/bugs', { replace: true });
        } else {
          setChatsFilter('channels');
          navigate('/chats', { replace: true });
        }
      } else if (contextType === 'GAME') {
        navigate('/', { replace: true });
      }
    }
  }, [isEmbedded, isLoadingContext, game, bug, userChat, groupChannel, contextType, navigate, setChatsFilter, location.pathname]);

  const loadContext = useCallback(async () => {
    if (!id) return null;
    
    try {
      if (contextType === 'GAME') {
        const response = await gamesApi.getById(id);
        setGame(response.data);
        return response.data;
      } else if (contextType === 'USER') {
        if (!userChat) {
          const { fetchUserChats, getChatById } = usePlayersStore.getState();
          await fetchUserChats();
          const foundChat = getChatById(id);
          if (foundChat) setUserChat(foundChat);
          return foundChat;
        }
        return userChat;
      } else if (contextType === 'GROUP') {
        const response = await chatApi.getGroupChannelById(id);
        setGroupChannel(response.data);
        setGroupChannelParticipantsCount(response.data.participantsCount || 0);
        if (response.data.bug) {
          setBug(response.data.bug as Bug);
        }
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('Failed to load context:', error);
      if (!isEmbedded) {
        if (contextType === 'GROUP') {
          const isBugChat = window.location.pathname.match(/^\/bugs\/[^/]+$/);
          if (isBugChat) {
            setChatsFilter('bugs');
            navigate('/bugs', { replace: true });
          } else {
            setChatsFilter('channels');
            navigate('/chats', { replace: true });
          }
        } else if (contextType === 'USER') {
          setChatsFilter('users');
          navigate('/chats', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
      return null;
    } finally {
      setIsLoadingContext(false);
    }
  }, [id, contextType, navigate, userChat, isEmbedded, setChatsFilter]);

  const scrollToBottom = useCallback(() => {
    const scroll = () => {
      if (chatContainerRef.current) {
        const messagesContainer = chatContainerRef.current.querySelector('.overflow-y-auto') as HTMLElement;
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }
    };
    requestAnimationFrame(() => {
      scroll();
      setTimeout(scroll, 50);
      setTimeout(scroll, 150);
    });
  }, []);

  const loadMessages = useCallback(async (pageNum = 1, append = false, chatTypeOverride?: ChatType) => {
    if (!id) return;
    const effectiveChatType = chatTypeOverride ?? currentChatType;
    try {
      if (!append) {
        setIsLoadingMessages(true);
        setIsInitialLoad(true);
      }
      let response: ChatMessage[];
      if (contextType === 'USER') {
        response = await chatApi.getUserChatMessages(id, pageNum, 50);
      } else if (contextType === 'GROUP') {
        response = await chatApi.getGroupChannelMessages(id, pageNum, 50);
      } else {
        const normalizedChatType = normalizeChatType(effectiveChatType);
        response = await chatApi.getMessages(contextType, id, pageNum, 50, normalizedChatType);
      }
      if (append) {
        setMessages(prev => {
          const newMessages = [...response, ...prev];
          messagesRef.current = newMessages;
          return newMessages;
        });
      } else {
        messagesRef.current = response;
        setMessages(response);
        scrollToBottom();
        const lastId = response.length > 0 ? response[response.length - 1]?.id : null;
        if (id && lastId) useChatSyncStore.getState().setLastMessageId(contextType, id, lastId);
      }
      setHasMoreMessages(response.length === 50);
      if (!append) {
        setIsLoadingMessages(false);
        const delay = isEmbedded ? 100 : 500;
        setTimeout(() => {
          setIsInitialLoad(false);
        }, delay);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      if (!append) {
        setIsLoadingMessages(false);
        setIsInitialLoad(false);
      }
    }
  }, [id, contextType, currentChatType, isEmbedded, scrollToBottom]);

  const loadMoreMessages = useCallback(async () => {
    if (!hasMoreMessages || isLoadingMore) return;
    
    setIsLoadingMore(true);
    justLoadedOlderMessagesRef.current = true;
    const nextPage = page + 1;
    await loadMessages(nextPage, true);
    setPage(nextPage);
    setIsLoadingMore(false);
    
    setTimeout(() => {
      justLoadedOlderMessagesRef.current = false;
    }, 500);
  }, [hasMoreMessages, isLoadingMore, page, loadMessages]);

  const fetchPinnedMessages = useCallback(async () => {
    if (!id || !canAccessChat) return;
    try {
      const list = await chatApi.getPinnedMessages(contextType, id, effectiveChatType);
      setPinnedMessages(list);
      setPinnedBarTopIndex(0);
    } catch {
      setPinnedMessages([]);
      setPinnedBarTopIndex(0);
    }
  }, [id, contextType, effectiveChatType, canAccessChat]);

  const loadMessagesBeforeMessageId = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!id) return false;
      let cursor: string | undefined = messageId;
      const maxIterations = 20;
      for (let i = 0; i < maxIterations; i++) {
        const batch = await chatApi.getMessages(contextType, id, 1, 50, effectiveChatType, cursor);
        if (batch.length > 0) {
          setMessages(prev => {
            const next = [...batch, ...prev];
            messagesRef.current = next;
            return next;
          });
          if (batch.some(m => m.id === messageId)) return true;
          if (batch.length < 50) return false;
          cursor = batch[0].id;
        } else {
          return false;
        }
      }
      return false;
    },
    [id, contextType, effectiveChatType]
  );

  const handleScrollToMessage = useCallback((messageId: string) => {
    if (!chatContainerRef.current) return;
    const messageElement = chatContainerRef.current.querySelector(`#message-${messageId}`) as HTMLElement;
    if (messageElement) {
      const messagesContainer = messageElement.closest('.overflow-y-auto') as HTMLElement;
      if (messagesContainer) {
        const messageOffsetTop = messageElement.offsetTop;
        const containerHeight = messagesContainer.clientHeight;
        const messageHeight = messageElement.offsetHeight;
        const targetScrollTop = messageOffsetTop - (containerHeight / 2) + (messageHeight / 2);
        messagesContainer.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      } else {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      messageElement.classList.add('message-highlight', 'ring-2', 'ring-blue-500', 'ring-opacity-50', 'bg-blue-50', 'dark:bg-blue-900/20');
      setTimeout(() => {
        messageElement.classList.remove('message-highlight', 'ring-2', 'ring-blue-500', 'ring-opacity-50', 'bg-blue-50', 'dark:bg-blue-900/20');
      }, 3000);
    }
  }, []);

  const scrollToMessageId = useCallback(
    async (messageId: string) => {
      const inList = messagesRef.current.some(m => m.id === messageId);
      if (inList) {
        handleScrollToMessage(messageId);
        return;
      }
      setLoadingScrollTargetId(messageId);
      try {
        const found = await loadMessagesBeforeMessageId(messageId);
        if (found) {
          handleScrollToMessage(messageId);
        } else {
          toast.error(t('chat.pinnedMessageNotFound', { defaultValue: 'Message no longer available' }));
        }
      } finally {
        setLoadingScrollTargetId(null);
      }
    },
    [handleScrollToMessage, loadMessagesBeforeMessageId, t]
  );

  const pinnedMessagesOrdered = useMemo(() => {
    const n = pinnedMessages.length;
    if (!n) return [];
    return Array.from({ length: n }, (_, i) => pinnedMessages[(pinnedBarTopIndex + i) % n]);
  }, [pinnedMessages, pinnedBarTopIndex]);

  const handlePinnedBarClick = useCallback(
    (_messageId: string) => {
      const n = pinnedMessages.length;
      if (!n) return;
      const topMessageId = pinnedMessages[pinnedBarTopIndex].id;
      scrollToMessageId(topMessageId);
      setPinnedBarTopIndex((prev) => (prev - 1 + n) % n);
    },
    [pinnedMessages, pinnedBarTopIndex, scrollToMessageId]
  );

  useEffect(() => {
    if (pinnedBarTopIndex >= pinnedMessages.length) {
      setPinnedBarTopIndex(0);
    }
  }, [pinnedMessages.length, pinnedBarTopIndex]);

  const handlePinMessage = useCallback(
    async (message: ChatMessage) => {
      try {
        await chatApi.pinMessage(message.id);
        await fetchPinnedMessages();
      } catch {
        toast.error(t('chat.pinFailed', { defaultValue: 'Failed to pin message' }));
      }
    },
    [fetchPinnedMessages, t]
  );

  const handleUnpinMessage = useCallback(
    async (messageId: string) => {
      try {
        await chatApi.unpinMessage(messageId);
        await fetchPinnedMessages();
      } catch {
        toast.error(t('chat.unpinFailed', { defaultValue: 'Failed to unpin message' }));
      }
    },
    [fetchPinnedMessages, t]
  );

  const handleAddReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user?.id) return;
    const optimisticReaction = {
      id: `pending-${Date.now()}`,
      messageId,
      userId: user.id,
      emoji,
      createdAt: new Date().toISOString(),
      user: user as import('@/types').BasicUser,
      _pending: true as const,
    };
    setMessages(prev => {
      const next = prev.map(m =>
        m.id === messageId
          ? { ...m, reactions: [...m.reactions.filter(r => r.userId !== user.id), optimisticReaction] }
          : m
      );
      messagesRef.current = next;
      return next;
    });
    try {
      const reaction = await chatApi.addReaction(messageId, { emoji });
      setMessages(prev => {
        const next = prev.map(m =>
          m.id === messageId
            ? { ...m, reactions: [...m.reactions.filter(r => r.userId !== reaction.userId), reaction] }
            : m
        );
        messagesRef.current = next;
        return next;
      });
    } catch (error) {
      console.error('Failed to add reaction:', error);
      setMessages(prev => {
        const next = prev.map(m =>
          m.id === messageId
            ? { ...m, reactions: m.reactions.filter(r => !(r.userId === user.id && (r as { _pending?: boolean })._pending)) }
            : m
        );
        messagesRef.current = next;
        return next;
      });
    }
  }, [user]);

  const handleRemoveReaction = useCallback(async (messageId: string) => {
    if (!user?.id) return;
    const message = messagesRef.current.find(m => m.id === messageId);
    const removedReactions = message?.reactions.filter(r => r.userId === user.id) ?? [];
    setMessages(prev => {
      const next = prev.map(m =>
        m.id === messageId ? { ...m, reactions: m.reactions.filter(r => r.userId !== user.id) } : m
      );
      messagesRef.current = next;
      return next;
    });
    try {
      await chatApi.removeReaction(messageId);
    } catch (error) {
      console.error('Failed to remove reaction:', error);
      setMessages(prev => {
        const next = prev.map(m =>
          m.id === messageId ? { ...m, reactions: [...m.reactions, ...removedReactions] } : m
        );
        messagesRef.current = next;
        return next;
      });
    }
  }, [user?.id]);

  const handlePollUpdated = useCallback((messageId: string, updatedPoll: import('@/api/chat').Poll) => {
    setMessages(prev => {
      const next = prev.map(m =>
        m.id === messageId && m.poll ? { ...m, poll: updatedPoll } : m
      );
      messagesRef.current = next;
      return next;
    });
  }, []);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      setMessages(prevMessages => {
        const newMessages = prevMessages.filter(message => message.id !== messageId);
        messagesRef.current = newMessages;
        return newMessages;
      });
      await chatApi.deleteMessage(messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  }, []);

  const handleReplyMessage = useCallback((message: ChatMessage) => {
    setReplyTo(message);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const handleEditMessage = useCallback((message: ChatMessage) => {
    setEditingMessage(message);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  const handleMessageUpdated = useCallback((updated: ChatMessage) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === updated.id);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...updated, _status: prev[idx]._status, _optimisticId: (prev[idx] as ChatMessageWithStatus)._optimisticId } as ChatMessageWithStatus;
      messagesRef.current = next;
      return next;
    });
    setEditingMessage(null);
  }, []);

  const handleAddOptimisticMessage = useCallback((payload: OptimisticMessagePayload): string => {
    if (!id) return '';
    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const optimistic: ChatMessageWithStatus = {
      id: tempId,
      chatContextType: contextType,
      contextId: id,
      senderId: user?.id ?? null,
      content: payload.content,
      mediaUrls: payload.mediaUrls,
      thumbnailUrls: payload.thumbnailUrls,
      mentionIds: payload.mentionIds,
      state: 'SENT',
      chatType: payload.chatType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      replyToId: payload.replyToId,
      replyTo: payload.replyTo,
      sender: user ? (user as import('@/types').BasicUser) : null,
      reactions: [],
      readReceipts: [],
      _status: 'SENDING',
      _optimisticId: tempId,
    };
    startTransition(() => {
      setMessages(prev => {
        const next = [...prev, optimistic];
        messagesRef.current = next;
        return next;
      });
    });
    messageQueueStorage.add({
      tempId,
      contextType,
      contextId: id,
      payload,
      createdAt: optimistic.createdAt,
      status: 'queued',
    }).catch(err => { console.error('[messageQueue] add', err); });
    requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
    return tempId;
  }, [contextType, id, user, scrollToBottom]);

  const handleMarkFailed = useCallback((tempId: string) => {
    setMessages(prev => {
      const next = prev.map(m =>
        (m as ChatMessageWithStatus)._optimisticId === tempId ? { ...m, _status: 'FAILED' as const } : m
      );
      messagesRef.current = next;
      return next;
    });
  }, []);

  const handleSendQueued = useCallback((params: {
    tempId: string;
    contextType: ChatContextType;
    contextId: string;
    payload: OptimisticMessagePayload;
    mediaUrls?: string[];
    thumbnailUrls?: string[];
  }) => {
    if (params.contextId !== id) return;
    sendWithTimeout(params, { onFailed: handleMarkFailed, onSuccess: (created) => handleNewMessageRef.current?.(created) });
  }, [id, handleMarkFailed]);

  const handleResendQueued = useCallback((tempId: string) => {
    if (!id) return;
    setMessages(prev => {
      const next = prev.map(m =>
        (m as ChatMessageWithStatus)._optimisticId === tempId ? { ...m, _status: 'SENDING' as const } : m
      );
      messagesRef.current = next;
      return next;
    });
    resend(tempId, contextType, id, { onFailed: handleMarkFailed, onSuccess: (created) => handleNewMessageRef.current?.(created) }).catch(err => { console.error('[messageQueue] resend', err); });
  }, [id, contextType, handleMarkFailed]);

  const handleRemoveFromQueue = useCallback((tempId: string) => {
    setMessages(prev => {
      const next = prev.filter(m => (m as ChatMessageWithStatus)._optimisticId !== tempId);
      messagesRef.current = next;
      return next;
    });
    messageQueueStorage.remove(tempId, contextType, id!).catch(err => { console.error('[messageQueue] remove', err); });
    cancelSend(tempId);
  }, [contextType, id]);

  const handleSendFailed = useCallback((optimisticId: string) => {
    setMessages(prev => {
      const next = prev.filter(m => (m as ChatMessageWithStatus)._optimisticId !== optimisticId);
      messagesRef.current = next;
      return next;
    });
    if (id) {
      messageQueueStorage.remove(optimisticId, contextType, id).catch(err => { console.error('[messageQueue] remove', err); });
      cancelSend(optimisticId);
    }
  }, [contextType, id]);

  const handleReplaceOptimisticWithServerMessage = useCallback((optimisticId: string, serverMessage: ChatMessage) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => (m as ChatMessageWithStatus)._optimisticId === optimisticId);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...serverMessage, _optimisticId: optimisticId } as ChatMessageWithStatus;
      messagesRef.current = next;
      return next;
    });
    messageQueueStorage.remove(optimisticId, contextType, id!).catch(err => { console.error('[messageQueue] remove', err); });
    cancelSend(optimisticId);
  }, [contextType, id]);

  const handleJoinAsGuest = useCallback(async () => {
    if (!id) return;
    
    if (contextType === 'GAME') {
      setIsJoiningAsGuest(true);
      try {
        await gamesApi.joinAsGuest(id);
        const updatedContext = await loadContext();
        if (updatedContext && contextType === 'GAME') {
          setGame(updatedContext as Game);
        }
      } catch (error) {
        console.error('Failed to join chat:', error);
      } finally {
        setIsJoiningAsGuest(false);
      }
    } else if (contextType === 'GROUP') {
      setIsJoiningAsGuest(true);
      try {
        await chatApi.joinGroupChannel(id);
        await loadContext();
      } catch (error) {
        console.error('Failed to join group/channel:', error);
      } finally {
        setIsJoiningAsGuest(false);
      }
    }
  }, [id, contextType, loadContext]);

  const handleLeaveChat = useCallback(async () => {
    if (!id || isLeavingChat) return;

    setIsLeavingChat(true);
    try {
      if (contextType === 'GAME') {
        const isGuestOnly = userParticipant?.status === 'GUEST';
        if (isGuestOnly) {
          await gamesApi.leaveChat(id);
        } else {
          await gamesApi.leave(id);
        }
        navigate(-1);
      } else if (contextType === 'GROUP') {
        await chatApi.leaveGroupChannel(id);

        // Navigate based on the type of group chat
        if (groupChannel?.marketItem) {
          // If it's a marketplace item chat, go to marketplace
          navigate('/marketplace', { replace: true });
        } else if (groupChannel?.bug) {
          setChatsFilter('bugs');
          navigate('/bugs', { replace: true });
        } else {
          // For regular channels, go to chats with channels filter
          setChatsFilter('channels');
          navigate('/chats', { replace: true });
        }
      }
    } catch (error) {
      console.error('Failed to leave chat:', error);
    } finally {
      setIsLeavingChat(false);
      setShowLeaveConfirmation(false);
    }
  }, [id, contextType, isLeavingChat, navigate, userParticipant?.status, groupChannel, setChatsFilter]);

  const handleToggleMute = useCallback(async () => {
    if (!id || isTogglingMute) return;

    setIsTogglingMute(true);
    try {
      if (isMuted) {
        await chatApi.unmuteChat(contextType, id);
        setIsMuted(false);
      } else {
        await chatApi.muteChat(contextType, id);
        setIsMuted(true);
      }
    } catch (error) {
      console.error('Failed to toggle mute:', error);
    } finally {
      setIsTogglingMute(false);
    }
  }, [id, contextType, isMuted, isTogglingMute]);

  const handleJoinChannel = useCallback(() => {
    if (contextType === 'GROUP') {
      setGroupChannel(prev => prev ? { ...prev, isParticipant: true } : prev);
    }
  }, [contextType]);

  const handleChatTypeChange = useCallback(async (newChatType: ChatType) => {
    if (newChatType === currentChatType || contextType === 'USER') return;
    setIsSwitchingChatType(true);
    setIsLoadingMessages(true);
    setCurrentChatType(newChatType);
    setPage(1);
    setHasMoreMessages(true);
    try {
      const normalizedChatType = normalizeChatType(newChatType);
      const response = await chatApi.getMessages(contextType, id!, 1, 50, normalizedChatType);
      messagesRef.current = response;
      setMessages(response);
      setHasMoreMessages(response.length === 50);
      if (user?.id) {
        await applyQueuedMessagesToState({
          contextType,
          contextId: id!,
          currentChatType: normalizedChatType,
          userId: user.id,
          user: user as import('@/types').BasicUser,
          messagesRef,
          setMessages,
          handleMarkFailed,
          onMessageCreated: (created) => handleNewMessageRef.current?.(created),
        });
      }
      scrollToBottom();
      if (id && user?.id && contextType === 'GAME') {
        chatApi.markAllMessagesAsRead(id, [normalizedChatType]).then((markReadResponse) => {
          const markedCount = markReadResponse.data.count || 0;
          const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
          setUnreadMessages(Math.max(0, unreadMessages - markedCount));
        }).catch(() => {});
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsSwitchingChatType(false);
      setIsLoadingMessages(false);
      setIsInitialLoad(false);
    }
  }, [currentChatType, contextType, id, user, scrollToBottom, handleMarkFailed]);

  const availableChatTypes = useMemo((): ChatType[] => {
    if (contextType !== 'GAME') return ['PUBLIC'];
    const participant = game?.participants?.find(p => p.userId === user?.id);
    const parentParticipant = game?.parent?.participants?.find(p => p.userId === user?.id);
    return getAvailableGameChatTypes(game ?? { status: undefined }, participant ?? undefined, parentParticipant ?? undefined);
  }, [contextType, game, user?.id]);

  const handleNewMessage = useCallback((message: ChatMessage): string | void => {
    const normalizedCurrentChatType = normalizeChatType(currentChatType);
    const normalizedMessageChatType = normalizeChatType(message.chatType);
    const matchesChatType = contextType === 'USER' || normalizedMessageChatType === normalizedCurrentChatType;
    if (!matchesChatType) return;

    if (contextType === 'USER' && id && !message.senderId && message.content) {
      const parsed = parseSystemMessage(message.content);
      if (parsed?.type === 'USER_CHAT_ACCEPTED') {
        const { fetchUserChats, getChatById } = usePlayersStore.getState();
        fetchUserChats().then(() => {
          const updated = getChatById(id!);
          if (updated) setUserChat(updated);
        });
      }
    }

    let replacedOptimisticId: string | undefined;
    setMessages(prevMessages => {
      const exists = prevMessages.some(msg => msg.id === message.id);
      if (exists) return prevMessages;

      const isOwnServerMessage = message.senderId === user?.id;
      if (isOwnServerMessage) {
        const msgReplyToId = message.replyToId ?? null;
        const msgMentionIds = message.mentionIds?.slice().sort() ?? [];
        const idx = prevMessages.findIndex((m): m is ChatMessageWithStatus => {
            const status = (m as ChatMessageWithStatus)._status;
            if (status !== 'SENDING' && status !== 'FAILED') return false;
            if (m.content !== message.content || m.senderId !== message.senderId) return false;
          if (normalizeChatType(m.chatType) !== normalizedMessageChatType) return false;
          const mReply = m.replyToId ?? null;
          if (mReply !== msgReplyToId) return false;
          const mIds = (m.mentionIds?.slice().sort() ?? []) as string[];
          if (mIds.length !== msgMentionIds.length || mIds.some((id, i) => id !== msgMentionIds[i])) return false;
          return true;
        });
        if (idx >= 0) {
          replacedOptimisticId = (prevMessages[idx] as ChatMessageWithStatus)._optimisticId;
          const next = [...prevMessages];
          next[idx] = { ...message, _optimisticId: replacedOptimisticId } as ChatMessageWithStatus;
          messagesRef.current = next;
          return next;
        }
      }

      const newMessages = [...prevMessages, message as ChatMessageWithStatus];
      messagesRef.current = newMessages;
      return newMessages;
    });

    if (id) useChatSyncStore.getState().setLastMessageId(contextType, id, message.id);

    if (replacedOptimisticId) {
      messageQueueStorage.remove(replacedOptimisticId, contextType, id!).catch(err => { console.error('[messageQueue] remove', err); });
      cancelSend(replacedOptimisticId);
      return replacedOptimisticId;
    }
  }, [contextType, currentChatType, id, user?.id]);
  handleNewMessageRef.current = handleNewMessage;

  const handleMessageReaction = useCallback((reaction: any) => {
    if (reaction.action === 'removed') {
      setMessages(prevMessages => {
        const newMessages = prevMessages.map(message => {
          if (message.id === reaction.messageId) {
            return {
              ...message,
              reactions: message.reactions.filter(r => r.userId !== reaction.userId)
            };
          }
          return message;
        });
        messagesRef.current = newMessages;
        return newMessages;
      });
    } else {
      setMessages(prevMessages => {
        const newMessages = prevMessages.map(message => {
          if (message.id === reaction.messageId) {
            const existingReaction = message.reactions.find(r => r.userId === reaction.userId);
            if (existingReaction) {
              return {
                ...message,
                reactions: message.reactions.map(r => 
                  r.userId === reaction.userId ? { ...r, emoji: reaction.emoji } : r
                )
              };
            } else {
              return {
                ...message,
                reactions: [...message.reactions, reaction]
              };
            }
          }
          return message;
        });
        messagesRef.current = newMessages;
        return newMessages;
      });
    }
  }, []);

  const handleReadReceipt = useCallback((readReceipt: any) => {
    setMessages(prevMessages => {
      let changed = false;
      const newMessages = prevMessages.map(message => {
        if (message.id === readReceipt.messageId) {
          const existingReceipt = message.readReceipts.find(r => r.userId === readReceipt.userId);
          if (!existingReceipt) {
            changed = true;
            return { ...message, readReceipts: [...message.readReceipts, readReceipt] };
          }
        }
        return message;
      });
      if (!changed) return prevMessages;
      messagesRef.current = newMessages;
      return newMessages;
    });
  }, []);

  const handleMessageDeleted = useCallback((data: { messageId: string }) => {
    setMessages(prevMessages => {
      const newMessages = prevMessages.filter(message => message.id !== data.messageId);
      messagesRef.current = newMessages;
      return newMessages;
    });
    setEditingMessage(prev => (prev?.id === data.messageId ? null : prev));
  }, []);

  const handleChatRequestRespond = useCallback(async (messageId: string, accepted: boolean) => {
    if (!id) return;
    try {
      const result = await chatApi.respondToChatRequest(id, messageId, accepted);
      setMessages(prev => {
        const next = prev.map(m => {
          if (m.id === messageId && m.content) {
            try {
              const parsed = JSON.parse(m.content);
              if (parsed.type === 'USER_CHAT_REQUEST') {
                return { ...m, content: JSON.stringify({ ...parsed, responded: true }) };
              }
            } catch {
              // ignore invalid JSON
            }
          }
          return m;
        });
        const exists = next.some(m => m.id === result.message.id);
        if (!exists) {
          const withNew = [...next, result.message as ChatMessageWithStatus];
          messagesRef.current = withNew;
          return withNew;
        }
        messagesRef.current = next;
        return next;
      });
      if (result.userChat) {
        setUserChat((prev) => prev ? { ...prev, ...result.userChat } : result.userChat);
        usePlayersStore.setState((state) => ({
          chats: {
            ...state.chats,
            [result.userChat!.id]: { ...state.chats[result.userChat!.id], ...result.userChat },
          },
        }));
      }
    } catch (err) {
      console.error('Respond to chat request failed:', err);
    }
  }, [id]);

  useEffect(() => {
    if (id !== previousIdRef.current) {
      const prevId = previousIdRef.current;
      if (prevId) cancelAllForContext(contextType, prevId);
      setGame(null);
      setBug(null);
      setUserChat(null);
      setMessages([]);
      messagesRef.current = [];
      setPage(1);
      setHasMoreMessages(true);
      setIsLoadingMessages(true);
      setIsInitialLoad(true);
      if (!isEmbedded) {
        setIsLoadingContext(true);
      }
      setIsBlockedByUser(false);
      setIsMuted(false);
      setReplyTo(null);
      setEditingMessage(null);
      setPinnedMessages([]);
      setCurrentChatType(initialChatType || 'PUBLIC');
      setHasSetDefaultChatType(false);
      previousIdRef.current = id;
      loadingIdRef.current = undefined;
      hasLoadedRef.current = false;
      isLoadingRef.current = false;
    }
  }, [id, isEmbedded, contextType, initialChatType]);

  // Handle forceReload from navigation state (e.g., from express interest)
  useEffect(() => {
    if (locationState?.forceReload) {
      // Reset loading refs to force a fresh load
      hasLoadedRef.current = false;
      loadingIdRef.current = undefined;
    }
  }, [locationState?.forceReload]);

  useEffect(() => {
    const ac = new AbortController();
    const signal = ac.signal;

    const loadData = async () => {
      if (!id || !user?.id) return;

      const currentLoadId = `${id}-${contextType}`;
      if (loadingIdRef.current === currentLoadId && hasLoadedRef.current) return;
      if (isLoadingRef.current && loadingIdRef.current === currentLoadId) return;

      loadingIdRef.current = currentLoadId;
      isLoadingRef.current = true;
      hasLoadedRef.current = false;
      setIsInitialLoad(true);
      setIsLoadingMessages(true);

      try {
        const loadedContext = await loadContext();
        if (signal.aborted || loadingIdRef.current !== currentLoadId) return;

        if (contextType === 'USER' && user?.id) {
          const uc = (loadedContext || userChat) as UserChatType | null;
          const otherUserId = uc ? (uc.user1Id === user.id ? uc.user2Id : uc.user1Id) : null;
          if (otherUserId) {
            try {
              const blockedBy = await blockedUsersApi.checkIfBlockedByUser(otherUserId);
              if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
              setIsBlockedByUser(blockedBy);
            } catch (error) {
              if (!signal.aborted) console.error('Failed to check if blocked by user:', error);
            }
          }
        }

        try {
          const muteStatus = await chatApi.isChatMuted(contextType, id);
          if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
          setIsMuted(muteStatus.isMuted);
        } catch (error) {
          if (!signal.aborted) console.error('Failed to check mute status:', error);
        }

        let effectiveChatType: ChatType = currentChatType;
        if (!hasSetDefaultChatType && contextType === 'GAME' && loadedContext) {
          setHasSetDefaultChatType(true);
          const loadedGame = loadedContext as Game;
          const loadedParticipant = loadedGame.participants?.find(p => p.userId === user?.id);
          const defaultType: ChatType = (loadedParticipant?.status === 'PLAYING') ? 'PRIVATE' : 'PUBLIC';
          effectiveChatType = initialChatType ?? defaultType;
          if (effectiveChatType !== currentChatType) {
            setCurrentChatType(effectiveChatType);
          }
        } else if (initialChatType && initialChatType !== 'PUBLIC' && contextType === 'GAME') {
          effectiveChatType = initialChatType;
          if (effectiveChatType !== currentChatType) {
            setCurrentChatType(effectiveChatType);
          }
        }
        if (signal.aborted) return;

        await loadMessages(1, false, contextType === 'GAME' ? effectiveChatType : undefined);
        if (signal.aborted || loadingIdRef.current !== currentLoadId) return;

        if (user?.id) {
          await applyQueuedMessagesToState({
            contextType,
            contextId: id,
            currentChatType: normalizeChatType(effectiveChatType),
            userId: user.id,
            user: user as import('@/types').BasicUser,
            messagesRef,
            setMessages,
            handleMarkFailed,
            onMessageCreated: (created) => handleNewMessageRef.current?.(created),
          });
        }
        if (!signal.aborted) hasLoadedRef.current = true;

        const runMarkReadBackground = () => {
          if (contextType === 'GAME' && loadedContext) {
            const loadedGame = loadedContext as Game;
            const loadedUserParticipant = loadedGame.participants.find(p => p.userId === user.id);
            const loadedIsParticipant = !!loadedUserParticipant;
            const loadedHasPendingInvite = loadedGame.participants?.some(p => p.userId === user.id && p.status === 'INVITED') ?? false;
            const loadedIsGuest = loadedGame.participants.some(p => p.userId === user.id && (p.status === 'GUEST' || !isParticipantPlaying(p))) ?? false;
            if (loadedIsParticipant || loadedHasPendingInvite || loadedIsGuest || loadedGame.isPublic) {
              const loadedParentParticipant = loadedGame.parent?.participants?.find(p => p.userId === user.id);
              const availableChatTypes = getAvailableGameChatTypes(loadedGame, loadedUserParticipant ?? undefined, loadedParentParticipant ?? undefined);
              chatApi.markAllMessagesAsReadForContext('GAME', id, availableChatTypes).then((markReadResponse) => {
                const markedCount = markReadResponse.data?.count || 0;
                const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
                setUnreadMessages(Math.max(0, unreadMessages - markedCount));
                window.dispatchEvent(new CustomEvent('unread-count-invalidated'));
              }).catch(() => {});
            }
          } else if (contextType === 'USER' && id) {
            chatApi.markAllMessagesAsReadForContext('USER', id).then((markReadResponse) => {
              const markedCount = markReadResponse.data?.count || 0;
              const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
              setUnreadMessages(Math.max(0, unreadMessages - markedCount));
              const { updateUnreadCount } = usePlayersStore.getState();
              updateUnreadCount(id, () => 0);
              window.dispatchEvent(new CustomEvent('unread-count-invalidated'));
            }).catch(() => {});
          } else if (contextType === 'GROUP' && id) {
            chatApi.markGroupChannelAsRead(id).then((markReadResponse) => {
              const markedCount = markReadResponse.data?.count || 0;
              const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
              setUnreadMessages(Math.max(0, unreadMessages - markedCount));
              window.dispatchEvent(new CustomEvent('unread-count-invalidated'));
            }).catch(() => {});
          }
        };
        runMarkReadBackground();
      } finally {
        if (!signal.aborted) isLoadingRef.current = false;
      }
    };

    loadData();

    return () => {
      ac.abort();
      if (loadingIdRef.current === `${id}-${contextType}`) {
        isLoadingRef.current = false;
      }
    };
  }, [id, user, contextType, initialChatType, currentChatType, hasSetDefaultChatType, loadContext, loadMessages, userChat, handleMarkFailed]);

  useEffect(() => {
    if (!id || !canAccessChat) return;
    fetchPinnedMessages();
  }, [id, currentChatType, canAccessChat, fetchPinnedMessages]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !id) return;
    const handler = (data: { contextType: string; contextId: string }) => {
      if (data.contextType === contextType && data.contextId === id) fetchPinnedMessages();
    };
    socket.on('chat:pinned-messages-updated', handler);
    return () => {
      socket.off('chat:pinned-messages-updated', handler);
    };
  }, [id, contextType, fetchPinnedMessages]);

  const lastChatMessage = useSocketEventsStore((state) => state.lastChatMessage);
  const lastChatMessageUpdated = useSocketEventsStore((state) => state.lastChatMessageUpdated);
  const lastChatReaction = useSocketEventsStore((state) => state.lastChatReaction);
  const lastChatReadReceipt = useSocketEventsStore((state) => state.lastChatReadReceipt);
  const lastChatDeleted = useSocketEventsStore((state) => state.lastChatDeleted);
  const lastSyncRequired = useSocketEventsStore((state) => state.lastSyncRequired);
  const lastPollVote = useSocketEventsStore((state) => state.lastPollVote);

  useEffect(() => {
    if (!id) return;
    const setupSocket = async () => {
      await socketService.joinChatRoom(contextType, id);
    };
    setupSocket();
    return () => {
      socketService.leaveChatRoom(contextType, id);
    };
  }, [id, contextType]);

  useEffect(() => {
    if (contextType === 'GROUP' && id) {
      useNavigationStore.getState().setViewingGroupChannelId(id);
      return () => useNavigationStore.getState().setViewingGroupChannelId(null);
    }
  }, [contextType, id]);

  // Track keyboard height for Capacitor mobile apps
  useEffect(() => {
    if (!isCapacitor()) return;

    const updateKeyboardHeight = () => {
      const heightStr = getComputedStyle(document.documentElement)
        .getPropertyValue('--keyboard-height')
        .trim();
      const height = parseFloat(heightStr) || 0;
      setKeyboardHeight(height);
    };

    // Listen for keyboard-visible class changes
    const observer = new MutationObserver(() => {
      updateKeyboardHeight();
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Initial check
    updateKeyboardHeight();

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (missedForContext.length === 0 || !id) return;
    const toMerge = useChatSyncStore.getState().getAndClearMissed(contextType, id);
    if (toMerge.length === 0) return;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const added = toMerge.filter((m) => !ids.has(m.id));
      if (added.length === 0) return prev;
      const next = [...prev, ...added].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      messagesRef.current = next;
      const lastId = next[next.length - 1]?.id;
      if (lastId) useChatSyncStore.getState().setLastMessageId(contextType, id, lastId);
      return next;
    });
    scrollToBottom();
  }, [missedForContext.length, contextType, id, scrollToBottom]);

  useEffect(() => {
    if (!lastChatMessage || lastChatMessage.contextType !== contextType || lastChatMessage.contextId !== id) return;
    handleNewMessage(lastChatMessage.message);

    if (id) {
      if (contextType === 'USER') {
        usePlayersStore.getState().updateUnreadCount(id, 0);
      } else if (contextType === 'GROUP') {
        window.dispatchEvent(new CustomEvent('chat-viewing-clear-unread', { detail: { contextType: 'GROUP', contextId: id } }));
      }
    }

    if (lastChatMessage.messageId && lastChatMessage.message?.senderId !== user?.id) {
      socketService.acknowledgeMessage(
        lastChatMessage.messageId,
        contextType as 'GAME' | 'BUG' | 'USER' | 'GROUP',
        id
      );
      socketService.confirmMessageReceipt(lastChatMessage.messageId, 'socket');
    }
  }, [lastChatMessage, contextType, id, user?.id, handleNewMessage]);

  useEffect(() => {
    if (!lastChatReaction || lastChatReaction.contextType !== contextType || lastChatReaction.contextId !== id) return;
    handleMessageReaction(lastChatReaction.reaction);
  }, [lastChatReaction, contextType, id, handleMessageReaction]);

  useEffect(() => {
    if (!lastChatReadReceipt || lastChatReadReceipt.contextType !== contextType || lastChatReadReceipt.contextId !== id) return;
    handleReadReceipt(lastChatReadReceipt.readReceipt);
  }, [lastChatReadReceipt, contextType, id, handleReadReceipt]);

  useEffect(() => {
    if (!lastChatDeleted || lastChatDeleted.contextType !== contextType || lastChatDeleted.contextId !== id) return;
    handleMessageDeleted({ messageId: lastChatDeleted.messageId });
    fetchPinnedMessages();
  }, [lastChatDeleted, contextType, id, handleMessageDeleted, fetchPinnedMessages]);

  useEffect(() => {
    if (!lastChatMessageUpdated || lastChatMessageUpdated.contextType !== contextType || lastChatMessageUpdated.contextId !== id || !lastChatMessageUpdated.message) return;
    handleMessageUpdated(lastChatMessageUpdated.message);
  }, [lastChatMessageUpdated, contextType, id, handleMessageUpdated]);

  useEffect(() => {
    if (!lastSyncRequired || !id) return;
    const currentMessages = messagesRef.current;
    if (currentMessages.length > 0) {
      const lastMessage = currentMessages[currentMessages.length - 1];
      socketService.syncMessages(contextType as 'GAME' | 'BUG' | 'USER' | 'GROUP', id, lastMessage.id);
    }
  }, [lastSyncRequired, contextType, id]);

  useEffect(() => {
    if (!lastPollVote || lastPollVote.contextType !== contextType || lastPollVote.contextId !== id) return;
    
    setMessages(prevMessages => {
      const newMessages = prevMessages.map(message => {
        if (message.id === lastPollVote.messageId && message.poll) {
          return {
            ...message,
            poll: lastPollVote.updatedPoll
          };
        }
        return message;
      });
      messagesRef.current = newMessages;
      return newMessages;
    });
  }, [lastPollVote, contextType, id]);

  useEffect(() => {
    if (justLoadedOlderMessagesRef.current) {
      return;
    }
    
    if (!isLoadingMessages && !isSwitchingChatType && !isLoadingMore && !isInitialLoad && messages.length > 0) {
      scrollToBottom();
    }
  }, [isLoadingMessages, isSwitchingChatType, isLoadingMore, isInitialLoad, messages.length, scrollToBottom]);

  const displaySettings = user ? resolveDisplaySettings(user) : resolveDisplaySettings(null);
  const getTitle = useCallback(() => {
    if (contextType === 'GAME' && game) {
      if (game.name) return game.name;
      if (game.club) return `${game.club.name}`;
      return `${game.gameType} Game`;
    } else if (isBugChat && bug) {
      return bug.text.length > 25 ? `${bug.text.substring(0, 23)}...` : bug.text;
    } else if (contextType === 'USER' && userChat) {
      const otherUser = userChat.user1Id === user?.id ? userChat.user2 : userChat.user1;
      return `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim() || 'Unknown';
    } else if (contextType === 'GROUP' && groupChannel) {
      return groupChannel.name;
    }
    return 'Chat';
  }, [contextType, game, isBugChat, bug, userChat, user?.id, groupChannel]);
  const getSubtitle = useCallback(() => {
    if (contextType === 'GAME' && game) {
      if (game.timeIsSet === false) {
        return t('gameDetails.datetimeNotSet');
      }
      const longDateD = getGameTimeDisplay({ game, displaySettings, startTime: game.startTime, kind: 'longDate', t });
      const timeRangeD = getGameTimeDisplay({ game, displaySettings, startTime: game.startTime, endTime: game.endTime, kind: 'timeRange', t });
      return `${longDateD.primaryText} • ${timeRangeD.primaryText}`;
    } else if (isBugChat && bug) {
      return `${formatDate(bug.createdAt, 'PPP')} • ${t(`bug.types.${bug.bugType}`)} • ${t(`bug.statuses.${bug.status}`)}`;
    } else if (contextType === 'GROUP' && groupChannel) {
      return t('chat.participants', { count: groupChannelParticipantsCount });
    }
    return null;
  }, [contextType, game, displaySettings, isBugChat, bug, groupChannel, groupChannelParticipantsCount, t]);
  const getIcon = useCallback(() => {
    if (isBugChat) {
      return <BugIcon size={16} className="text-red-500" />;
    } else if (contextType === 'GAME' && !game?.name) {
      return <MapPin size={16} className="text-gray-500 dark:text-gray-400" />;
    } else if (contextType === 'USER' && userChat) {
      const otherUser = userChat.user1Id === user?.id ? userChat.user2 : userChat.user1;
      return (
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
          {otherUser.avatar ? (
            <img
              src={otherUser.avatar || ''}
              alt={otherUser.firstName || ''}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-semibold">
              {otherUser.firstName?.[0]}{otherUser.lastName?.[0]}
            </div>
          )}
        </div>
      );
    } else if (contextType === 'GROUP' && groupChannel) {
      return (
        <button
          onClick={() => {
            if (isItemChat) {
              setShowItemPage(true);
              setIsItemPageAnimating(true);
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  setIsItemPageAnimating(false);
                });
              });
            } else {
              setShowParticipantsPage(true);
              setIsParticipantsPageAnimating(true);
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  setIsParticipantsPageAnimating(false);
                });
              });
            }
          }}
          className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
        >
          {groupChannel.marketItem ? (
            groupChannel.marketItem.mediaUrls?.length ? (
              <img
                src={groupChannel.marketItem.mediaUrls[0]}
                alt={groupChannel.name}
                className="w-10 h-10 rounded-full object-cover shadow-lg dark:shadow-[0_0_8px_rgba(251,191,36,0.5),0_0_16px_rgba(251,191,36,0.3)]"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shadow-lg dark:shadow-[0_0_8px_rgba(251,191,36,0.5),0_0_16px_rgba(251,191,36,0.3)]">
                <Package className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
            )
          ) : groupChannel.avatar ? (
            <img
              src={groupChannel.avatar}
              alt={groupChannel.name}
              className="w-10 h-10 rounded-full object-cover shadow-lg dark:shadow-[0_0_8px_rgba(251,191,36,0.5),0_0_16px_rgba(251,191,36,0.3)]"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shadow-lg dark:shadow-[0_0_8px_rgba(251,191,36,0.5),0_0_16px_rgba(251,191,36,0.3)]">
              {groupChannel.isChannel ? (
                <Hash className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              ) : (
                <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              )}
            </div>
          )}
        </button>
      );
    }
    return null;
  }, [isBugChat, contextType, game, userChat, user?.id, isItemChat, groupChannel]);

  if (isLoadingContext && !isEmbedded) {
    return (
      <div className="chat-container bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 z-40 shadow-lg" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  handleBack(navigate);
                }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
              </button>
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
        </header>
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <MessageList
            messages={[]}
            onAddReaction={handleAddReaction}
            onRemoveReaction={handleRemoveReaction}
            onDeleteMessage={handleDeleteMessage}
            onReplyMessage={handleReplyMessage}
            onPollUpdated={handlePollUpdated}
            isLoading={false}
            isLoadingMessages={true}
            isSwitchingChatType={false}
            onScrollToMessage={handleScrollToMessage}
            hasMoreMessages={false}
            onLoadMore={loadMoreMessages}
            isInitialLoad={true}
            isLoadingMore={false}
            disableReadTracking={contextType === 'USER'}
          />
        </main>
      </div>
    );
  }


  if (!canViewPublicChat) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('chat.accessDenied')}</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{t('chat.accessDeniedMessage')}</p>
          <button
            onClick={() => navigate(`/games/${id}`)}
            className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {t('common.viewGame')}
          </button>
        </div>
      </div>
    );
  }

  const showLoadingHeader = isEmbedded && isLoadingContext;

  return (
    <>
    <div ref={chatContainerRef} className={`chat-container relative bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden overflow-x-hidden ${isEmbedded ? 'chat-embedded h-full' : 'h-screen'} ${(showParticipantsPage || showItemPage) ? 'hidden' : ''}`}>
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 z-40 shadow-lg" style={{ paddingTop: isEmbedded ? '0' : 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
          {showLoadingHeader ? (
            <div className="flex items-center gap-3 w-full">
              <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
                <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {!isEmbedded && (
                  <button
                    onClick={() => {
                      if (showItemPage) {
                        setIsItemPageAnimating(true);
                        setTimeout(() => setShowItemPage(false), 300);
                        return;
                      }
                      if (showParticipantsPage) {
                        setIsParticipantsPageAnimating(true);
                        setTimeout(() => {
                          setShowParticipantsPage(false);
                        }, 300);
                        return;
                      }
                      
                      handleBack(navigate);
                    }}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                  >
                    <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                  </button>
                )}
                {(contextType === 'GROUP' && (showParticipantsPage || showItemPage || isParticipantsPageAnimating || isItemPageAnimating)) && (
                  <div
                    className={`hidden md:block transition-all duration-300 ease-in-out ${
                      showParticipantsPage || showItemPage || isParticipantsPageAnimating || isItemPageAnimating
                        ? 'opacity-100 translate-x-0 w-auto'
                        : 'opacity-0 translate-x-4 w-0 pointer-events-none'
                    }`}
                  >
                    <button
                      onClick={() => {
                        if (showItemPage) {
                          setIsItemPageAnimating(true);
                          setTimeout(() => setShowItemPage(false), 300);
                        } else {
                          setIsParticipantsPageAnimating(true);
                          setTimeout(() => {
                            setShowParticipantsPage(false);
                          }, 300);
                        }
                      }}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                    >
                      <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                    </button>
                  </div>
                )}
                <div 
                  className={`flex items-center gap-2 min-w-0 flex-1 ${(contextType === 'USER' || contextType === 'GROUP') ? 'cursor-pointer' : ''}`}
                  onClick={contextType === 'USER' && userChat && user?.id ? () => setShowPlayerCard(true) : contextType === 'GROUP' ? () => {
                    if (isItemChat) {
                      setShowItemPage(true);
                      setIsItemPageAnimating(true);
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          setIsItemPageAnimating(false);
                        });
                      });
                    } else {
                      setShowParticipantsPage(true);
                      setIsParticipantsPageAnimating(true);
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          setIsParticipantsPageAnimating(false);
                        });
                      });
                    }
                  } : undefined}
                >
                {!isBugChat && <div className="flex-shrink-0">{getIcon()}</div>}
                <div className="min-w-0 flex-1">
                  <h1 className={`${isBugChat ? 'text-base' : 'text-lg'} font-semibold text-gray-900 dark:text-white flex items-center gap-2 whitespace-nowrap overflow-hidden`}>
                    {isBugChat && <BugIcon size={16} className="text-red-500 flex-shrink-0" />}
                    <span 
                      className={`truncate ${contextType === 'GROUP' ? 'hover:text-primary-600 dark:hover:text-primary-400 transition-colors' : ''}`}
                    >
                      {getTitle()}
                    </span>
                  </h1>
                  {getSubtitle() && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {getSubtitle()}
                    </p>
                  )}
                </div>
                </div>
              </div>
              
              {showHeaderActions && (
                <ChatHeaderActions
                  showMute={showMute}
                  showLeave={showLeave}
                  showParticipantsButton={contextType === 'GAME'}
                  isMuted={isMuted}
                  isTogglingMute={isTogglingMute}
                  onToggleMute={handleToggleMute}
                  onLeaveClick={() => setShowLeaveConfirmation(true)}
                  leaveTitle={leaveTitle}
                  game={game}
                  onParticipantsClick={() => setShowParticipantsModal(true)}
                />
              )}
            </>
          )}
        </div>

        {!showLoadingHeader && contextType === 'GAME' && ((isParticipant && isPlayingParticipant) || isAdminOrOwner || (game?.status && game.status !== 'ANNOUNCED')) && availableChatTypes.length > 1 && (
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="max-w-2xl mx-auto px-4" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
              <div className="flex justify-center space-x-1 py-2">
                {availableChatTypes.map((chatType) => (
                  <button
                    key={chatType}
                    onClick={() => handleChatTypeChange(chatType)}
                    disabled={isSwitchingChatType}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      currentChatType === chatType
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                    } ${isSwitchingChatType ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {chatType === 'PHOTOS' ? (
                      <Camera size={18} />
                    ) : (
                      t(`chat.types.${chatType}`)
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      <AnimatePresence>
        {!showLoadingHeader && pinnedMessagesOrdered.length > 0 && !showParticipantsPage && !showItemPage && (
          <motion.div
            key="pinned-bar"
            initial={{ opacity: 0, maxHeight: 0 }}
            animate={{ opacity: 1, maxHeight: 80 }}
            exit={{ opacity: 0, maxHeight: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <PinnedMessagesBar
              pinnedMessages={[pinnedMessagesOrdered[0]]}
              currentIndex={pinnedBarTopIndex + 1}
              totalCount={pinnedMessages.length}
              loadingScrollTargetId={loadingScrollTargetId}
              onItemClick={handlePinnedBarClick}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <main
        className="flex-1 flex flex-col min-h-0 overflow-hidden overflow-x-hidden relative transition-all duration-300"
        style={{
          marginBottom: isCapacitor() && keyboardHeight > 0 ? `${keyboardHeight}px` : '0px'
        }}
      >
        <AnimatePresence>
          {!showLoadingHeader && pinnedMessagesOrdered.length > 0 && !showParticipantsPage && !showItemPage && (
            <motion.div
              key="pinned-shadow"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute top-0 left-0 right-0 z-[1] pointer-events-none"
            >
              <div
                className="h-4 w-full dark:hidden"
                style={{
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0.1), transparent)',
                }}
              />
              <div
                className="h-4 w-full hidden dark:block"
                style={{
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), transparent)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {/* Context-aware collapsible panel - overhangs the chat */}
        {!showLoadingHeader && !showParticipantsPage && !showItemPage && (
          <ChatContextPanel
            contextType={contextType}
            bug={bug}
            marketItem={groupChannel?.marketItem}
            groupChannel={groupChannel}
            canEditBug={isBugAdmin}
            onUpdate={() => {
              if (id) {
                loadContext().then(() => loadMessages());
              }
            }}
            onJoinChannel={handleJoinChannel}
          />
        )}
        {contextType === 'GROUP' && isItemChat && (showItemPage || isItemPageAnimating) && groupChannel?.marketItem && (
          <div 
            className={`absolute inset-0 h-full transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-900 ${
              showItemPage && !isItemPageAnimating
                ? 'opacity-100 translate-x-0 z-10'
                : 'opacity-0 translate-x-full z-0 pointer-events-none'
            }`}
            onTransitionEnd={() => {
              if (isItemPageAnimating && !showItemPage) {
                setIsItemPageAnimating(false);
              }
            }}
          >
            <MarketItemPanel
              item={groupChannel.marketItem}
              onClose={() => {
                setIsItemPageAnimating(true);
                setTimeout(() => setShowItemPage(false), 300);
              }}
              onItemUpdate={() => {
                if (id) {
                  loadContext().then(() => loadMessages());
                }
              }}
            />
          </div>
        )}
        {contextType === 'GROUP' && !isItemChat && (showParticipantsPage || isParticipantsPageAnimating) && groupChannel && (
          <div 
            className={`absolute inset-0 h-full transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-900 ${
              showParticipantsPage && !isParticipantsPageAnimating
                ? 'opacity-100 translate-x-0 z-10'
                : 'opacity-0 translate-x-full z-0 pointer-events-none'
            }`}
            onTransitionEnd={() => {
              if (isParticipantsPageAnimating && !showParticipantsPage) {
                setIsParticipantsPageAnimating(false);
              }
            }}
          >
            <GroupChannelSettings
              groupChannel={groupChannel}
              onParticipantsCountChange={(count) => {
                setGroupChannelParticipantsCount(count);
              }}
              onUpdate={async () => {
                if (id) {
                  const updated = await chatApi.getGroupChannelById(id);
                  setGroupChannel(updated.data);
                  setGroupChannelParticipantsCount(updated.data.participantsCount || 0);
                }
              }}
            />
          </div>
        )}
        <div
          className={`flex-1 flex flex-col min-h-0 transition-all duration-300 ease-in-out ${
            showParticipantsPage || showItemPage || isParticipantsPageAnimating || isItemPageAnimating
              ? 'opacity-0 -translate-x-full'
              : 'opacity-100 translate-x-0'
          }`}
        >
        <MessageList
          messages={messages}
          onAddReaction={handleAddReaction}
          onRemoveReaction={handleRemoveReaction}
          onDeleteMessage={handleDeleteMessage}
          onReplyMessage={handleReplyMessage}
          onEditMessage={handleEditMessage}
          onPollUpdated={handlePollUpdated}
          onResendQueued={handleResendQueued}
          onRemoveFromQueue={handleRemoveFromQueue}
          isLoading={isLoadingMore}
          isLoadingMessages={isLoadingMessages && !isEmbedded}
          isSwitchingChatType={isSwitchingChatType}
          onScrollToMessage={handleScrollToMessage}
          hasMoreMessages={hasMoreMessages}
          onLoadMore={loadMoreMessages}
          isInitialLoad={isInitialLoad && !isEmbedded}
          isLoadingMore={isLoadingMore}
          disableReadTracking={contextType === 'USER'}
          isChannel={isChannel}
          userChatUser1Id={contextType === 'USER' && userChat ? userChat.user1Id : undefined}
          userChatUser2Id={contextType === 'USER' && userChat ? userChat.user2Id : undefined}
          onChatRequestRespond={handleChatRequestRespond}
          hasContextPanel={!showLoadingHeader && !showParticipantsPage && !showItemPage}
          pinnedMessageIds={pinnedMessages.map(m => m.id)}
          onPin={canWriteChat ? handlePinMessage : undefined}
          onUnpin={canWriteChat ? handleUnpinMessage : undefined}
        />
        </div>

      </main>

      {(!isInitialLoad || isEmbedded) && !(contextType === 'GROUP' && (showParticipantsPage || showItemPage || isParticipantsPageAnimating || isItemPageAnimating)) && (
      <footer
        className="md:flex-shrink-0 md:relative absolute left-0 right-0 z-50 md:z-40 !bg-transparent md:!bg-white md:dark:!bg-gray-800 md:border-t md:border-gray-200 md:dark:border-gray-700 border-transparent transition-all duration-300"
        style={{
          bottom: isCapacitor() && keyboardHeight > 0 ? `${keyboardHeight}px` : '0px',
          paddingBottom: isCapacitor() && keyboardHeight > 0 ? '8px' : 'env(safe-area-inset-bottom)'
        }}
      >
        {isBlockedByUser && contextType === 'USER' ? (
          <div className="px-4 py-3" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
            <div className="text-sm text-center text-gray-700 dark:text-gray-300 rounded-[20px] px-4 py-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
              {t('chat.blockedByUser')}
            </div>
          </div>
        ) : contextType === 'USER' && userChat && user?.id && (() => {
          const otherUser = user.id === userChat.user1Id ? userChat.user2 : userChat.user1;
          const otherSideAllowed = user.id === userChat.user1Id ? userChat.user2allowed : userChat.user1allowed;
          const otherAllowsNonContacts = otherUser?.allowMessagesFromNonContacts !== false;
          return !otherSideAllowed && !otherAllowsNonContacts;
        })() ? (
          <RequestToChat
            userChatId={id!}
            disabled={messages.length > 0}
            onUserChatUpdate={(uc) => setUserChat((prev) => prev ? { ...prev, ...uc } : null)}
          />
        ) : canAccessChat && canWriteChat && !isChannelParticipantOnly ? (
          <div className="relative overflow-visible">
            <MessageInput
              gameId={contextType === 'GAME' ? id : undefined}
              userChatId={contextType === 'USER' ? (id || userChat?.id) : undefined}
              groupChannelId={contextType === 'GROUP' ? id : undefined}
              game={game}
              bug={bug}
              groupChannel={groupChannel}
              onOptimisticMessage={handleAddOptimisticMessage}
              onSendQueued={handleSendQueued}
              onSendFailed={handleSendFailed}
              onMessageCreated={handleReplaceOptimisticWithServerMessage}
              disabled={false}
              replyTo={replyTo}
              onCancelReply={handleCancelReply}
              editingMessage={editingMessage}
              onCancelEdit={handleCancelEdit}
              onEditMessage={handleMessageUpdated}
              lastOwnMessage={lastOwnMessage}
              onStartEditMessage={handleEditMessage}
              onScrollToMessage={handleScrollToMessage}
              chatType={currentChatType}
              onGroupChannelUpdate={contextType === 'GROUP' ? () => { loadContext(); } : undefined}
              contextType={contextType}
              contextId={id ?? ''}
            />
          </div>
        ) : (
          !(contextType === 'GAME' && isInJoinQueue) && !(contextType === 'GAME' && game && (game.status === 'FINISHED' || game.status === 'ARCHIVED')) && !(contextType === 'GROUP' && isChannelParticipant) && !(contextType === 'GAME' && currentChatType === 'PHOTOS' && !isPlayingParticipant && !isAdminOrOwner) && (
            <div className="px-4 py-3" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
              <div className="flex items-center justify-center">
                {contextType === 'GROUP' && groupChannel ? (
                  <JoinGroupChannelButton
                    groupChannel={groupChannel}
                    onJoin={handleJoinAsGuest}
                    isLoading={isJoiningAsGuest}
                  />
                ) : (
                  <button
                    onClick={handleJoinAsGuest}
                    disabled={isJoiningAsGuest}
                    className="w-full px-6 py-3 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
                  >
                    {isJoiningAsGuest ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {t('common.loading')}
                      </>
                    ) : (
                      <>
                        <MessageCircle size={20} />
                        {contextType === 'GROUP' && isChannel ? t('chat.joinChannel') : contextType === 'GROUP' && !isChannel ? t('chat.joinGroup') : t('chat.joinChatToSend')}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )
        )}
      </footer>
      )}

      {contextType === 'GAME' && showParticipantsModal && game && (
        <ChatParticipantsModal
          game={game}
          onClose={() => setShowParticipantsModal(false)}
          currentChatType={currentChatType}
        />
      )}

      {contextType === 'USER' && (
        <PlayerCardBottomSheet
          playerId={showPlayerCard && userChat && user?.id ? (userChat.user1Id === user.id ? userChat.user2Id : userChat.user1Id) ?? null : null}
          onClose={() => setShowPlayerCard(false)}
        />
      )}

      {(contextType === 'GAME' || isBugChat || contextType === 'GROUP') && (
        <ConfirmationModal
          isOpen={showLeaveConfirmation}
          title={contextType === 'GAME' ? leaveModalLabels.title : t('chat.leave')}
          message={contextType === 'GAME' ? leaveModalLabels.message : t('chat.leaveConfirmation')}
          confirmText={contextType === 'GAME' ? leaveModalLabels.confirmText : t('chat.leave')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={handleLeaveChat}
          onClose={() => setShowLeaveConfirmation(false)}
        />
      )}
    </div>

    </>
  );
};
