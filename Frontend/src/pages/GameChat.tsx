import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { chatApi, ChatMessage, ChatContextType, UserChat as UserChatType } from '@/api/chat';
import { gamesApi } from '@/api/games';
import { bugsApi } from '@/api/bugs';
import { blockedUsersApi } from '@/api/blockedUsers';
import { Game, ChatType, Bug } from '@/types';
import { MessageList } from '@/components/MessageList';
import { MessageInput } from '@/components/MessageInput';
import { ChatParticipantsModal } from '@/components/ChatParticipantsModal';
import { ChatParticipantsButton } from '@/components/ChatParticipantsButton';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { usePlayersStore } from '@/store/playersStore';
import { useNavigationStore } from '@/store/navigationStore';
import { formatDate } from '@/utils/dateFormat';
import { socketService } from '@/services/socketService';
import { isUserGameAdminOrOwner, isGroupChannelOwner, isGroupChannelAdminOrOwner } from '@/utils/gameResults';
import { normalizeChatType } from '@/utils/chatType';
import { MessageCircle, ArrowLeft, MapPin, LogOut, Camera, Bug as BugIcon, Bell, BellOff, Users } from 'lucide-react';
import { GroupChannelParticipantsModal } from '@/components/chat/GroupChannelParticipantsModal';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { handleBackNavigation } from '@/utils/navigation';

interface LocationState {
  initialChatType?: ChatType;
  contextType?: ChatContextType;
  chat?: UserChatType;
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
    ? (propChatType === 'user' ? 'USER' : propChatType === 'bug' ? 'BUG' : (propChatType === 'group' || propChatType === 'channel') ? 'GROUP' : 'GAME')
    : (locationState?.contextType || 
      (location.pathname.includes('/bugs/') ? 'BUG' : 
       location.pathname.includes('/user-chat/') ? 'USER' :
       (location.pathname.includes('/group-chat/') || location.pathname.includes('/channel-chat/')) ? 'GROUP' : 'GAME'));
  const initialChatType = locationState?.initialChatType;
  
  const [game, setGame] = useState<Game | null>(null);
  const [bug, setBug] = useState<Bug | null>(null);
  const [userChat, setUserChat] = useState<UserChatType | null>(locationState?.chat || null);
  const [groupChannel, setGroupChannel] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSwitchingChatType, setIsSwitchingChatType] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);
  const [currentChatType, setCurrentChatType] = useState<ChatType>(initialChatType || 'PUBLIC');
  const [isLoadingContext, setIsLoadingContext] = useState(!isEmbedded);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [isLeavingChat, setIsLeavingChat] = useState(false);
  const [isBlockedByUser, setIsBlockedByUser] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [hasSetDefaultChatType, setHasSetDefaultChatType] = useState(false);
  const sendingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSendingRef = useRef(false);
  const sendingStartTimeRef = useRef<number | null>(null);
  const justLoadedOlderMessagesRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const previousIdRef = useRef<string | undefined>(undefined);
  const messagesRef = useRef<ChatMessage[]>([]);

  const userParticipant = game?.participants.find(p => p.userId === user?.id);
  const isParticipant = !!userParticipant;
  const isPlayingParticipant = userParticipant?.isPlaying ?? false;
  const isAdminOrOwner = game && user ? isUserGameAdminOrOwner(game, user.id) : (userParticipant?.role === 'ADMIN' || userParticipant?.role === 'OWNER');
  const hasPendingInvite = game?.invites?.some(invite => invite.receiverId === user?.id) ?? false;
  const isGuest = game?.participants.some(p => p.userId === user?.id && !p.isPlaying && p.role !== 'OWNER' && p.role !== 'ADMIN') ?? false;
  // TODO: Remove after 2025-02-02 - Backward compatibility: check both old joinQueues and new non-playing participants
  const isInJoinQueue = useMemo(() => {
    if (!game || !user?.id) return false;
    
    const userParticipant = game.participants.find(p => p.userId === user.id);
    const isNonPlayingParticipant = userParticipant && !userParticipant.isPlaying && userParticipant.role === 'PARTICIPANT';
    const isInOldQueue = game.joinQueues?.some(q => q.userId === user.id && q.status === 'PENDING') || false;
    
    return isNonPlayingParticipant || isInOldQueue;
  }, [game, user?.id]);
  const playingCount = game?.participants.filter(p => p.isPlaying).length ?? 0;
  const hasUnoccupiedSlots = game ? (game.entityType === 'BAR' || playingCount < game.maxParticipants) : false;
  
  const isBugCreator = bug?.senderId === user?.id;
  const isBugAdmin = user?.isAdmin;
  const isBugParticipant = bug?.participants?.some(p => p.userId === user?.id) ?? false;
  const canWriteBugChat = contextType === 'BUG' && (isBugCreator || isBugAdmin || isBugParticipant);
  
  const isChannelOwner = contextType === 'GROUP' && groupChannel && user ? isGroupChannelOwner(groupChannel, user.id) : false;
  const isChannelAdminOrOwner = contextType === 'GROUP' && groupChannel && user ? isGroupChannelAdminOrOwner(groupChannel, user.id) : false;
  const isChannelParticipant = contextType === 'GROUP' && groupChannel && (groupChannel.isParticipant || isChannelOwner);
  const isChannel = contextType === 'GROUP' && groupChannel?.isChannel;
  const isChannelParticipantOnly = isChannel && isChannelParticipant && !isChannelAdminOrOwner;
  
  const canAccessChat = contextType === 'USER' || (contextType === 'BUG' && canWriteBugChat) || (contextType === 'GAME' && (isParticipant || hasPendingInvite || isGuest || isAdminOrOwner)) || (contextType === 'GROUP' && (isChannelParticipant || !isChannel));
  const canViewPublicChat = contextType === 'USER' || contextType === 'BUG' || contextType === 'GROUP' || canAccessChat || game?.isPublic;
  const isCurrentUserGuest = game?.participants?.some(participant => participant.userId === user?.id && !participant.isPlaying && participant.role !== 'OWNER' && participant.role !== 'ADMIN') ?? false;

  useEffect(() => {
    if (!isEmbedded) {
      setBottomTabsVisible(false);
      return () => {
        setBottomTabsVisible(true);
      };
    }
  }, [setBottomTabsVisible, isEmbedded]);

  useBackButtonHandler(() => {
    const locationState = location.state as { fromLeagueSeasonGameId?: string } | null;
    
    handleBackNavigation({
      pathname: location.pathname,
      locationState,
      navigate,
      setChatsFilter,
      contextType,
      gameId: id,
    });
    
    return true;
  });

  useEffect(() => {
    if (!isEmbedded && !isLoadingContext && !game && !bug && !userChat && !groupChannel) {
      if (contextType === 'USER') {
        setChatsFilter('users');
        navigate('/chats', { replace: true });
      } else if (contextType === 'GROUP') {
        setChatsFilter('channels');
        navigate('/chats', { replace: true });
      } else if (contextType === 'BUG') {
        navigate('/bugs', { replace: true });
      } else if (contextType === 'GAME') {
        navigate('/', { replace: true });
      }
    }
  }, [isEmbedded, isLoadingContext, game, bug, userChat, groupChannel, contextType, navigate, setChatsFilter]);

  const loadContext = useCallback(async () => {
    if (!id) return null;
    
    try {
      if (contextType === 'GAME') {
        const response = await gamesApi.getById(id);
        setGame(response.data);
        return response.data;
      } else if (contextType === 'BUG') {
        const response = await bugsApi.getBugById(id);
        setBug(response.data);
        return response.data;
      } else if (contextType === 'USER') {
        if (!userChat) {
          const { fetchUserChats, getChatById } = usePlayersStore.getState();
          await fetchUserChats();
          const foundChat = getChatById(id);
          if (foundChat) {
            setUserChat(foundChat);
            const otherUserId = foundChat.user1Id === user?.id ? foundChat.user2Id : foundChat.user1Id;
            if (otherUserId && user?.id) {
              try {
                const blockedBy = await blockedUsersApi.checkIfBlockedByUser(otherUserId);
                setIsBlockedByUser(blockedBy);
              } catch (error) {
                console.error('Failed to check if blocked by user:', error);
              }
            }
          }
          return foundChat;
        }
        if (userChat && user?.id) {
          const otherUserId = userChat.user1Id === user.id ? userChat.user2Id : userChat.user1Id;
          if (otherUserId) {
            try {
              const blockedBy = await blockedUsersApi.checkIfBlockedByUser(otherUserId);
              setIsBlockedByUser(blockedBy);
            } catch (error) {
              console.error('Failed to check if blocked by user:', error);
            }
          }
        }
        return userChat;
      } else if (contextType === 'GROUP') {
        const response = await chatApi.getGroupChannelById(id);
        setGroupChannel(response.data);
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('Failed to load context:', error);
      if (!isEmbedded) {
        if (contextType === 'BUG') {
          navigate('/bugs', { replace: true });
        } else if (contextType === 'GROUP') {
          setChatsFilter('channels');
          navigate('/chats', { replace: true });
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
  }, [id, contextType, navigate, userChat, user?.id, isEmbedded, setChatsFilter]);

  const loadMessages = useCallback(async (pageNum = 1, append = false) => {
    if (!id) return;
    
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
        const normalizedChatType = normalizeChatType(currentChatType);
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
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (chatContainerRef.current) {
              const messagesContainer = chatContainerRef.current.querySelector('.overflow-y-auto') as HTMLElement;
              if (messagesContainer) {
                messagesContainer.scrollTo({
                  top: messagesContainer.scrollHeight,
                  behavior: 'smooth'
                });
              }
            }
          });
        });
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
  }, [id, contextType, currentChatType, isEmbedded]);

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

  const handleAddReaction = useCallback(async (messageId: string, emoji: string) => {
    try {
      await chatApi.addReaction(messageId, { emoji });
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  }, []);

  const handleRemoveReaction = useCallback(async (messageId: string) => {
    try {
      await chatApi.removeReaction(messageId);
    } catch (error) {
      console.error('Failed to remove reaction:', error);
    }
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

  const handleMessageSent = useCallback(() => {
    if (sendingTimeoutRef.current) {
      clearTimeout(sendingTimeoutRef.current);
    }
    isSendingRef.current = true;
    sendingStartTimeRef.current = Date.now();
    setIsSendingMessage(true);
    sendingTimeoutRef.current = setTimeout(() => {
      isSendingRef.current = false;
      sendingStartTimeRef.current = null;
      setIsSendingMessage(false);
      sendingTimeoutRef.current = null;
    }, 5000);
  }, []);

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
        messageElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
      
      messageElement.classList.add('message-highlight', 'ring-2', 'ring-blue-500', 'ring-opacity-50', 'bg-blue-50', 'dark:bg-blue-900/20');
      setTimeout(() => {
        messageElement.classList.remove('message-highlight', 'ring-2', 'ring-blue-500', 'ring-opacity-50', 'bg-blue-50', 'dark:bg-blue-900/20');
      }, 3000);
    }
  }, []);

  const handleJoinAsGuest = useCallback(async () => {
    if (!id) return;
    
    if (contextType === 'GAME') {
      setIsJoiningAsGuest(true);
      try {
        await gamesApi.join(id);
        const updatedContext = await loadContext();
        if (updatedContext && contextType === 'GAME') {
          setGame(updatedContext as Game);
        }
      } catch (error) {
        console.error('Failed to join game:', error);
      } finally {
        setIsJoiningAsGuest(false);
      }
    } else if (contextType === 'BUG') {
      setIsJoiningAsGuest(true);
      try {
        await bugsApi.joinChat(id);
        await loadContext();
      } catch (error) {
        console.error('Failed to join bug chat:', error);
      } finally {
        setIsJoiningAsGuest(false);
      }
    } else if (contextType === 'GROUP' && isChannel) {
      setIsJoiningAsGuest(true);
      try {
        await chatApi.joinGroupChannel(id);
        await loadContext();
      } catch (error) {
        console.error('Failed to join channel:', error);
      } finally {
        setIsJoiningAsGuest(false);
      }
    }
  }, [id, contextType, loadContext, isChannel]);

  const handleGuestLeave = useCallback(async () => {
    await loadContext();
  }, [loadContext]);

  const handleLeaveChat = useCallback(async () => {
    if (!id || isLeavingChat) return;
    
    setIsLeavingChat(true);
    try {
      if (contextType === 'GAME') {
        await gamesApi.leave(id);
        await loadContext();
        const locationState = location.state as { fromLeagueSeasonGameId?: string } | null;
        handleBackNavigation({
          pathname: location.pathname,
          locationState,
          navigate,
          contextType: 'GAME',
          gameId: id,
        });
      } else if (contextType === 'BUG') {
        await bugsApi.leaveChat(id);
        await loadContext();
      } else if (contextType === 'GROUP' && isChannel) {
        await chatApi.leaveGroupChannel(id);
        await loadContext();
      }
    } catch (error) {
      console.error('Failed to leave chat:', error);
    } finally {
      setIsLeavingChat(false);
      setShowLeaveConfirmation(false);
    }
  }, [id, contextType, isLeavingChat, loadContext, navigate, isChannel]);

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

  const handleChatTypeChange = useCallback(async (newChatType: ChatType) => {
    if (newChatType === currentChatType || contextType === 'USER') return;
    
    const startTime = Date.now();
    setIsSwitchingChatType(true);
    setIsLoadingMessages(true);
    setCurrentChatType(newChatType);
    setPage(1);
    setHasMoreMessages(true);
    
    try {
      const normalizedChatType = normalizeChatType(newChatType);
      const response = await chatApi.getMessages(contextType, id!, 1, 50, normalizedChatType);
      
      if (id && user?.id && contextType === 'GAME') {
        const markReadResponse = await chatApi.markAllMessagesAsRead(id, [normalizedChatType]);
        const markedCount = markReadResponse.data.count || 0;
        
        const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
        const newCount = Math.max(0, unreadMessages - markedCount);
        setUnreadMessages(newCount);
      }
      
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 1500 - elapsedTime);
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
      
      messagesRef.current = response;
      setMessages(response);
      setHasMoreMessages(response.length === 50);
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const messagesContainer = document.querySelector('.overflow-y-auto');
          if (messagesContainer) {
            messagesContainer.scrollTo({
              top: messagesContainer.scrollHeight,
              behavior: 'smooth'
            });
          }
        });
      });
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsSwitchingChatType(false);
      setIsLoadingMessages(false);
      setIsInitialLoad(false);
    }
  }, [currentChatType, contextType, id, user?.id]);

  const getAvailableChatTypes = useCallback((): ChatType[] => {
    if (contextType !== 'GAME') return ['PUBLIC'];
    
    const availableTypes: ChatType[] = [];
    
    if (game?.status && game.status !== 'ANNOUNCED') {
      availableTypes.push('PHOTOS');
    }
    
    availableTypes.push('PUBLIC');
    
    if (isAdminOrOwner) {
      availableTypes.push('ADMINS');
      return availableTypes;
    }
    
    return availableTypes;
  }, [contextType, isAdminOrOwner, game?.status]);

  const handleNewMessage = useCallback((message: ChatMessage) => {
    const normalizedCurrentChatType = normalizeChatType(currentChatType);
    const normalizedMessageChatType = normalizeChatType(message.chatType);
    const matchesChatType = contextType === 'USER' || normalizedMessageChatType === normalizedCurrentChatType;
    if (matchesChatType) {
      setMessages(prevMessages => {
        const exists = prevMessages.some(msg => msg.id === message.id);
        if (exists) {
          return prevMessages;
        }
        
        if (isSendingRef.current && message.senderId === user?.id) {
          if (sendingTimeoutRef.current) {
            clearTimeout(sendingTimeoutRef.current);
            sendingTimeoutRef.current = null;
          }
          
          const minDisplayTime = 500;
          const elapsedTime = sendingStartTimeRef.current ? Date.now() - sendingStartTimeRef.current : minDisplayTime;
          const remainingTime = Math.max(0, minDisplayTime - elapsedTime);
          
          if (remainingTime > 0) {
            sendingTimeoutRef.current = setTimeout(() => {
              isSendingRef.current = false;
              sendingStartTimeRef.current = null;
              setIsSendingMessage(false);
              sendingTimeoutRef.current = null;
            }, remainingTime);
          } else {
            isSendingRef.current = false;
            sendingStartTimeRef.current = null;
            setIsSendingMessage(false);
          }
        }
        
        const newMessages = [...prevMessages, message];
        messagesRef.current = newMessages;
        return newMessages;
      });
    }
  }, [contextType, currentChatType, user?.id]);

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
      const newMessages = prevMessages.map(message => {
        if (message.id === readReceipt.messageId) {
          const existingReceipt = message.readReceipts.find(r => r.userId === readReceipt.userId);
          if (!existingReceipt) {
            return {
              ...message,
              readReceipts: [...message.readReceipts, readReceipt]
            };
          }
        }
        return message;
      });
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
  }, []);

  useEffect(() => {
    if (id !== previousIdRef.current) {
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
      setCurrentChatType('PUBLIC');
      setHasSetDefaultChatType(false);
      previousIdRef.current = id;
    }
  }, [id, isEmbedded]);

  useEffect(() => {
    const loadData = async () => {
      if (!id || !user?.id) return;
      if (isLoadingRef.current) return;
      
      isLoadingRef.current = true;
      setIsInitialLoad(true);
      setIsLoadingMessages(true);
      
      const loadedContext = await loadContext();
      
      if (contextType === 'USER' && userChat && user?.id) {
        const otherUserId = userChat.user1Id === user.id ? userChat.user2Id : userChat.user1Id;
        if (otherUserId) {
          try {
            const blockedBy = await blockedUsersApi.checkIfBlockedByUser(otherUserId);
            setIsBlockedByUser(blockedBy);
          } catch (error) {
            console.error('Failed to check if blocked by user:', error);
          }
        }
      }

      try {
        const muteStatus = await chatApi.isChatMuted(contextType, id);
        setIsMuted(muteStatus.isMuted);
      } catch (error) {
        console.error('Failed to check mute status:', error);
      }
      
      let targetChatType = currentChatType;
      
      if (!hasSetDefaultChatType && !initialChatType && contextType === 'GAME' && loadedContext) {
        targetChatType = 'PUBLIC';
        setCurrentChatType('PUBLIC');
        setHasSetDefaultChatType(true);
      }
      
      if (initialChatType && initialChatType !== 'PUBLIC' && contextType === 'GAME') {
        if (currentChatType !== initialChatType) {
          await handleChatTypeChange(initialChatType);
        } else {
          await loadMessages();
        }
      } else if (targetChatType !== currentChatType) {
        await handleChatTypeChange(targetChatType);
      } else {
        await loadMessages();
      }
      
      // Mark all messages as read when chat is opened (for all chat types)
      try {
        if (contextType === 'GAME' && loadedContext) {
          const loadedGame = loadedContext as Game;
          const loadedUserParticipant = loadedGame.participants.find(p => p.userId === user.id);
          const loadedIsParticipant = !!loadedUserParticipant;
          const loadedIsAdminOrOwner = loadedUserParticipant?.role === 'ADMIN' || loadedUserParticipant?.role === 'OWNER';
          const loadedHasPendingInvite = loadedGame.invites?.some(invite => invite.receiverId === user.id) ?? false;
          const loadedIsGuest = loadedGame.participants.some(p => p.userId === user.id && !p.isPlaying) ?? false;
          
          if (loadedIsParticipant || loadedHasPendingInvite || loadedIsGuest || loadedGame.isPublic) {
            const availableChatTypes: ChatType[] = [];
            if (loadedGame.status && loadedGame.status !== 'ANNOUNCED') {
              availableChatTypes.push('PHOTOS');
            }
            availableChatTypes.push('PUBLIC');
            if (loadedIsParticipant && loadedIsAdminOrOwner) {
              availableChatTypes.push('ADMINS');
            }
            
            const gameUnreadResponse = await chatApi.getGameUnreadCount(id);
            const gameUnreadCount = gameUnreadResponse.data.count || 0;
            
            await chatApi.markAllMessagesAsReadForContext('GAME', id, availableChatTypes);
            
            const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
            const newCount = Math.max(0, unreadMessages - gameUnreadCount);
            setUnreadMessages(newCount);
          }
        } else if (contextType === 'USER' && id) {
          const userChatUnreadResponse = await chatApi.getUserChatUnreadCount(id);
          const userChatUnreadCount = userChatUnreadResponse.data.count || 0;
          
          await chatApi.markAllMessagesAsReadForContext('USER', id);
          
          const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
          const newCount = Math.max(0, unreadMessages - userChatUnreadCount);
          setUnreadMessages(newCount);
          
          const { updateUnreadCount } = usePlayersStore.getState();
          updateUnreadCount(id, () => 0);
        } else if (contextType === 'BUG' && id) {
          const bugUnreadResponse = await chatApi.getBugUnreadCount(id);
          const bugUnreadCount = bugUnreadResponse.data.count || 0;
          
          await chatApi.markAllBugMessagesAsRead(id);
          
          const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
          const newCount = Math.max(0, unreadMessages - bugUnreadCount);
          setUnreadMessages(newCount);
        } else if (contextType === 'GROUP' && id) {
          const groupUnreadResponse = await chatApi.getGroupChannelUnreadCount(id);
          const groupUnreadCount = groupUnreadResponse.data.count || 0;
          
          await chatApi.markGroupChannelAsRead(id);
          
          const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
          const newCount = Math.max(0, unreadMessages - groupUnreadCount);
          setUnreadMessages(newCount);
        }
      } catch (error) {
        console.error('Failed to mark all messages as read:', error);
      }
      
      isLoadingRef.current = false;
    };
    
    loadData();
    
    return () => {
      isLoadingRef.current = false;
    };
  }, [loadContext, loadMessages, id, user?.id, initialChatType, currentChatType, handleChatTypeChange, contextType, userChat, hasSetDefaultChatType]);

  useEffect(() => {
    if (!id) return;

    const setupSocket = async () => {
      await socketService.joinChatRoom(contextType, id);
    };

    setupSocket();

    // Unified event handlers
    const handleUnifiedMessage = (data: { contextType: string; contextId: string; message: any; messageId?: string; timestamp?: string }) => {
      if (data.contextType === contextType && data.contextId === id) {
        handleNewMessage(data.message);
        
        // Acknowledge receipt via socket
        if (data.messageId && data.message?.senderId !== user?.id) {
          socketService.acknowledgeMessage(
            data.messageId,
            contextType as 'GAME' | 'BUG' | 'USER',
            id
          );
          
          // Also confirm via API for tracking
          socketService.confirmMessageReceipt(data.messageId, 'socket');
        }
      }
    };

    // Handle sync after reconnection
    const handleSyncRequired = () => {
      const currentMessages = messagesRef.current;
      if (currentMessages.length > 0) {
        const lastMessage = currentMessages[currentMessages.length - 1];
        socketService.syncMessages(contextType as 'GAME' | 'BUG' | 'USER', id, lastMessage.id);
      }
    };

    const handleUnifiedReaction = (data: { contextType: string; contextId: string; reaction: any }) => {
      if (data.contextType === contextType && data.contextId === id) {
        handleMessageReaction(data.reaction);
      }
    };

    const handleUnifiedReadReceipt = (data: { contextType: string; contextId: string; readReceipt: any }) => {
      if (data.contextType === contextType && data.contextId === id) {
        handleReadReceipt(data.readReceipt);
      }
    };

    const handleUnifiedDeleted = (data: { contextType: string; contextId: string; messageId: string }) => {
      if (data.contextType === contextType && data.contextId === id) {
        handleMessageDeleted({ messageId: data.messageId });
      }
    };

    // Unified events
    socketService.on('chat:message', handleUnifiedMessage);
    socketService.on('chat:reaction', handleUnifiedReaction);
    socketService.on('chat:read-receipt', handleUnifiedReadReceipt);
    socketService.on('chat:deleted', handleUnifiedDeleted);
    socketService.on('sync-required', handleSyncRequired);

    return () => {
      socketService.leaveChatRoom(contextType, id);
      
      // Clean up unified event listeners
      socketService.off('chat:message', handleUnifiedMessage);
      socketService.off('chat:reaction', handleUnifiedReaction);
      socketService.off('chat:read-receipt', handleUnifiedReadReceipt);
      socketService.off('chat:deleted', handleUnifiedDeleted);
      socketService.off('sync-required', handleSyncRequired);
    };
  }, [id, contextType, user?.id, handleNewMessage, handleMessageReaction, handleReadReceipt, handleMessageDeleted]);

  useEffect(() => {
    if (justLoadedOlderMessagesRef.current) {
      return;
    }
    
    if (!isLoadingMessages && !isSwitchingChatType && !isLoadingMore && !isInitialLoad && messages.length > 0) {
      const scrollToBottom = () => {
        if (chatContainerRef.current) {
          const messagesContainer = chatContainerRef.current.querySelector('.overflow-y-auto') as HTMLElement;
          if (messagesContainer) {
            messagesContainer.scrollTo({
              top: messagesContainer.scrollHeight,
              behavior: 'smooth'
            });
          }
        }
      };
      
      requestAnimationFrame(() => {
        requestAnimationFrame(scrollToBottom);
      });
    }
  }, [isLoadingMessages, isSwitchingChatType, isLoadingMore, isInitialLoad, messages.length]);

  if (isLoadingContext && !isEmbedded) {
    return (
      <div className="chat-container bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 z-40 shadow-lg" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const locationState = location.state as { fromLeagueSeasonGameId?: string } | null;
                  handleBackNavigation({
                    pathname: location.pathname,
                    locationState,
                    navigate,
                    setChatsFilter,
                    contextType,
                    gameId: id,
                  });
                }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
              </button>
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Access Denied</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">You don't have access to this chat.</p>
          <button
            onClick={() => navigate(`/games/${id}`)}
            className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            View Game
          </button>
        </div>
      </div>
    );
  }

  const getTitle = () => {
    if (contextType === 'GAME' && game) {
      if (game.name) return game.name;
      if (game.club) return `${game.club.name}`;
      return `${game.gameType} Game`;
    } else if (contextType === 'BUG' && bug) {
      return bug.text.length > 25 ? `${bug.text.substring(0, 23)}...` : bug.text;
    } else if (contextType === 'USER' && userChat) {
      const otherUser = userChat.user1Id === user?.id ? userChat.user2 : userChat.user1;
      return `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim() || 'Unknown';
    } else if (contextType === 'GROUP' && groupChannel) {
      return groupChannel.name;
    }
    return 'Chat';
  };

  const getSubtitle = () => {
    if (contextType === 'GAME' && game) {
      if (game.timeIsSet === false) {
        return t('gameDetails.datetimeNotSet');
      }
      return `${formatDate(game.startTime, 'PPP')} • ${formatDate(game.startTime, 'p')} - ${formatDate(game.endTime, 'p')}`;
    } else if (contextType === 'BUG' && bug) {
      return `${formatDate(bug.createdAt, 'PPP')} • ${t(`bug.types.${bug.bugType}`)} • ${t(`bug.statuses.${bug.status}`)}`;
    }
    return null;
  };

  const getIcon = () => {
    if (contextType === 'BUG') {
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
    }
    return null;
  };


  const showLoadingHeader = isEmbedded && isLoadingContext;

  return (
    <div ref={chatContainerRef} className={`chat-container bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden overflow-x-hidden ${isEmbedded ? 'chat-embedded h-full' : 'h-screen'}`}>
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 z-40 shadow-lg" style={{ paddingTop: isEmbedded ? '0' : 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
          {showLoadingHeader ? (
            <div className="flex items-center gap-3 w-full">
              <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
                <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {!isEmbedded && (
                  <button
                    onClick={() => {
                      const locationState = location.state as { fromLeagueSeasonGameId?: string } | null;
                      handleBackNavigation({
                        pathname: location.pathname,
                        locationState,
                        navigate,
                        setChatsFilter,
                        contextType,
                        gameId: id,
                      });
                    }}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                  >
                    <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                  </button>
                )}
                {contextType !== 'BUG' && <div className="flex-shrink-0">{getIcon()}</div>}
                <div className="min-w-0 flex-1">
                  <h1 className={`${contextType === 'BUG' ? 'text-base' : 'text-lg'} font-semibold text-gray-900 dark:text-white flex items-center gap-2 whitespace-nowrap overflow-hidden`}>
                    {contextType === 'BUG' && <BugIcon size={16} className="text-red-500 flex-shrink-0" />}
                    <span className="truncate">{getTitle()}</span>
                  </h1>
                  {getSubtitle() && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {getSubtitle()}
                    </p>
                  )}
                </div>
              </div>
              
              {contextType === 'GAME' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleMute}
                disabled={isTogglingMute}
                className={`p-2 rounded-lg transition-colors ${
                  isMuted
                    ? 'hover:bg-orange-100 dark:hover:bg-orange-900/20'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                title={isMuted ? t('chat.unmute', { defaultValue: 'Unmute chat' }) : t('chat.mute', { defaultValue: 'Mute chat' })}
              >
                {isMuted ? (
                  <BellOff size={20} className="text-orange-600 dark:text-orange-400" />
                ) : (
                  <Bell size={20} className="text-gray-600 dark:text-gray-400" />
                )}
              </button>
              {isCurrentUserGuest && game?.entityType !== 'LEAGUE' && (
                <button
                  onClick={() => setShowLeaveConfirmation(true)}
                  className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                  title={t('chat.leave')}
                >
                  <LogOut size={20} className="text-red-600 dark:text-red-400" />
                </button>
              )}
              <ChatParticipantsButton 
                game={game!} 
                onClick={() => setShowParticipantsModal(true)}
              />
            </div>
          )}
          {contextType === 'BUG' && bug && (isBugParticipant || isBugCreator || isBugAdmin) && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleMute}
                disabled={isTogglingMute}
                className={`p-2 rounded-lg transition-colors ${
                  isMuted
                    ? 'hover:bg-orange-100 dark:hover:bg-orange-900/20'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                title={isMuted ? t('chat.unmute', { defaultValue: 'Unmute chat' }) : t('chat.mute', { defaultValue: 'Mute chat' })}
              >
                {isMuted ? (
                  <BellOff size={20} className="text-orange-600 dark:text-orange-400" />
                ) : (
                  <Bell size={20} className="text-gray-600 dark:text-gray-400" />
                )}
              </button>
              {!isBugCreator && (
                <button
                  onClick={() => setShowLeaveConfirmation(true)}
                  className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                  title={t('chat.leave')}
                >
                  <LogOut size={20} className="text-red-600 dark:text-red-400" />
                </button>
              )}
            </div>
          )}
          {contextType === 'USER' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleMute}
                disabled={isTogglingMute}
                className={`p-2 rounded-lg transition-colors ${
                  isMuted
                    ? 'hover:bg-orange-100 dark:hover:bg-orange-900/20'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                title={isMuted ? t('chat.unmute', { defaultValue: 'Unmute chat' }) : t('chat.mute', { defaultValue: 'Mute chat' })}
              >
                {isMuted ? (
                  <BellOff size={20} className="text-orange-600 dark:text-orange-400" />
                ) : (
                  <Bell size={20} className="text-gray-600 dark:text-gray-400" />
                )}
              </button>
            </div>
          )}
          {contextType === 'GROUP' && groupChannel && (
            <div className="flex items-center gap-2">
              {isChannelParticipant && (
                <button
                  onClick={handleToggleMute}
                  disabled={isTogglingMute}
                  className={`p-2 rounded-lg transition-colors ${
                    isMuted
                      ? 'hover:bg-orange-100 dark:hover:bg-orange-900/20'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  title={isMuted ? t('chat.unmute', { defaultValue: 'Unmute chat' }) : t('chat.mute', { defaultValue: 'Mute chat' })}
                >
                  {isMuted ? (
                    <BellOff size={20} className="text-orange-600 dark:text-orange-400" />
                  ) : (
                    <Bell size={20} className="text-gray-600 dark:text-gray-400" />
                  )}
                </button>
              )}
              {isChannelParticipant && !isChannelOwner && isChannel && (
                <button
                  onClick={() => setShowLeaveConfirmation(true)}
                  className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                  title={t('chat.leaveChannel', { defaultValue: 'Leave Channel' })}
                >
                  <LogOut size={20} className="text-red-600 dark:text-red-400" />
                </button>
              )}
              {isChannelOwner && (
                <button
                  onClick={() => setShowParticipantsModal(true)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title={groupChannel.isChannel 
                    ? t('chat.viewChannelMembers', { defaultValue: 'View channel members' })
                    : t('chat.viewGroupMembers', { defaultValue: 'View group members' })}
                >
                  <Users size={20} className="text-gray-600 dark:text-gray-400" />
                </button>
              )}
            </div>
          )}
            </>
          )}
        </div>

        {!showLoadingHeader && contextType === 'GAME' && ((isParticipant && isPlayingParticipant) || isAdminOrOwner || (game?.status && game.status !== 'ANNOUNCED')) && (
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="max-w-2xl mx-auto px-4" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
              <div className="flex justify-center space-x-1 py-2">
                {getAvailableChatTypes().map((chatType) => (
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

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden overflow-x-hidden relative">
        <MessageList
          messages={messages}
          onAddReaction={handleAddReaction}
          onRemoveReaction={handleRemoveReaction}
          onDeleteMessage={handleDeleteMessage}
          onReplyMessage={handleReplyMessage}
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
        />
        
        {(!isInitialLoad || isEmbedded) && (
        <div className="md:hidden absolute bottom-0 left-0 right-0 z-40 pointer-events-none" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {isBlockedByUser && contextType === 'USER' ? (
          <div className="px-4 py-3 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))', background: 'transparent' }}>
            <div className="text-sm text-center text-gray-700 dark:text-gray-300 rounded-[20px] px-4 py-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 shadow-[0_8px_32px_rgba(0,0,0,0.16),0_16px_64px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_16px_64px_rgba(0,0,0,0.4)]">
              {t('chat.blockedByUser')}
            </div>
          </div>
        ) : canAccessChat ? (
          !isChannelParticipantOnly ? (
            <div className="relative overflow-visible pointer-events-auto" style={{ background: 'transparent' }}>
              <div 
                className={`transition-opacity duration-300 ease-in-out ${
                  isSendingMessage ? 'opacity-0 invisible' : 'opacity-100 visible'
                }`}
              >
                <MessageInput
                  gameId={contextType === 'GAME' ? id : undefined}
                  bugId={contextType === 'BUG' ? id : undefined}
                  userChatId={contextType === 'USER' ? (id || userChat?.id) : undefined}
                  groupChannelId={contextType === 'GROUP' ? id : undefined}
                  game={game}
                  bug={bug}
                  groupChannel={groupChannel}
                  onMessageSent={handleMessageSent}
                  disabled={false}
                  replyTo={replyTo}
                  onCancelReply={handleCancelReply}
                  onScrollToMessage={handleScrollToMessage}
                  chatType={currentChatType}
                />
              </div>
              {isSendingMessage && (
                <div className="absolute inset-0 p-4 flex items-center justify-center z-50 rounded-[24px] m-3 bg-white/95 dark:bg-gray-800/95 shadow-[0_8px_32px_rgba(0,0,0,0.16),0_16px_64px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_16px_64px_rgba(0,0,0,0.4)]">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium">{t('common.sending')}</span>
                  </div>
                </div>
              )}
            </div>
          ) : null
        ) : (
          !(contextType === 'GAME' && isInJoinQueue) && !(contextType === 'GAME' && game && (game.status === 'FINISHED' || game.status === 'ARCHIVED')) && (
            <div className="px-4 py-3 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))', background: 'transparent' }}>
              <div className="flex items-center justify-center" style={{ background: 'transparent' }}>
                <button
                  onClick={handleJoinAsGuest}
                  disabled={isJoiningAsGuest}
                  className="w-full px-6 py-3.5 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-[20px] hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(59,130,246,0.4)] hover:shadow-[0_6px_24px_rgba(59,130,246,0.5)] hover:scale-[1.02] font-medium"
                >
                  {isJoiningAsGuest ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : (
                    <>
                      <MessageCircle size={20} />
                      {contextType === 'GAME' && !hasUnoccupiedSlots
                        ? t('games.joinTheQueue')
                        : contextType === 'GROUP' && isChannel 
                        ? t('chat.joinChannel')
                        : t('chat.joinChatToSend')}
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        )}
        </div>
        )}
      </main>

      {(!isInitialLoad || isEmbedded) && (
      <footer className="hidden md:block flex-shrink-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {isBlockedByUser && contextType === 'USER' ? (
          <div className="px-4 py-3" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
            <div className="text-sm text-center text-gray-700 dark:text-gray-300 rounded-[20px] px-4 py-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
              {t('chat.blockedByUser')}
            </div>
          </div>
        ) : canAccessChat ? (
          !isChannelParticipantOnly ? (
            <div className="relative overflow-visible">
              <div 
                className={`transition-opacity duration-300 ease-in-out ${
                  isSendingMessage ? 'opacity-0 invisible' : 'opacity-100 visible'
                }`}
              >
                <MessageInput
                  gameId={contextType === 'GAME' ? id : undefined}
                  bugId={contextType === 'BUG' ? id : undefined}
                  userChatId={contextType === 'USER' ? (id || userChat?.id) : undefined}
                  groupChannelId={contextType === 'GROUP' ? id : undefined}
                  game={game}
                  bug={bug}
                  groupChannel={groupChannel}
                  onMessageSent={handleMessageSent}
                  disabled={false}
                  replyTo={replyTo}
                  onCancelReply={handleCancelReply}
                  onScrollToMessage={handleScrollToMessage}
                  chatType={currentChatType}
                />
              </div>
              {isSendingMessage && (
                <div className="absolute inset-0 p-4 flex items-center justify-center z-50 bg-white/95 dark:bg-gray-800/95">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium">{t('common.sending')}</span>
                  </div>
                </div>
              )}
            </div>
          ) : null
        ) : (
          !(contextType === 'GAME' && isInJoinQueue) && !(contextType === 'GAME' && game && (game.status === 'FINISHED' || game.status === 'ARCHIVED')) && (
            <div className="px-4 py-3" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
              <div className="flex items-center justify-center">
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
                      {contextType === 'GAME' && !hasUnoccupiedSlots
                        ? t('games.joinTheQueue')
                        : contextType === 'GROUP' && isChannel 
                        ? t('chat.joinChannel')
                        : t('chat.joinChatToSend')}
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        )}
      </footer>
      )}

      {contextType === 'GROUP' && showParticipantsModal && groupChannel && (
        <GroupChannelParticipantsModal
          groupChannel={groupChannel}
          onClose={() => setShowParticipantsModal(false)}
          onUpdate={async () => {
            if (id) {
              const updated = await chatApi.getGroupChannelById(id);
              setGroupChannel(updated.data);
            }
          }}
        />
      )}
      {contextType === 'GAME' && showParticipantsModal && game && (
        <ChatParticipantsModal
          game={game}
          onClose={() => setShowParticipantsModal(false)}
          onGuestLeave={handleGuestLeave}
          currentChatType={currentChatType}
        />
      )}

      {(contextType === 'GAME' || contextType === 'BUG' || (contextType === 'GROUP' && isChannel)) && (
        <ConfirmationModal
          isOpen={showLeaveConfirmation}
          title={t('chat.leave')}
          message={t('chat.leaveConfirmation')}
          confirmText={t('chat.leave')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={handleLeaveChat}
          onClose={() => setShowLeaveConfirmation(false)}
        />
      )}
    </div>
  );
};
