import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { formatDate } from '@/utils/dateFormat';
import { socketService } from '@/services/socketService';
import { isUserGameAdminOrOwner } from '@/utils/gameResults';
import { MessageCircle, ArrowLeft, MapPin, LogOut, Camera, Bug as BugIcon, Bell, BellOff } from 'lucide-react';

interface LocationState {
  initialChatType?: ChatType;
  contextType?: ChatContextType;
  chat?: UserChatType;
}

export const GameChat: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  
  const locationState = location.state as LocationState | null;
  const contextType: ChatContextType = locationState?.contextType || 
    (location.pathname.includes('/bugs/') ? 'BUG' : 
     location.pathname.includes('/user-chat/') ? 'USER' : 'GAME');
  const initialChatType = locationState?.initialChatType;
  
  const [game, setGame] = useState<Game | null>(null);
  const [bug, setBug] = useState<Bug | null>(null);
  const [userChat, setUserChat] = useState<UserChatType | null>(locationState?.chat || null);
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
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [isLeavingChat, setIsLeavingChat] = useState(false);
  const [isBlockedByUser, setIsBlockedByUser] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const sendingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSendingRef = useRef(false);
  const sendingStartTimeRef = useRef<number | null>(null);
  const justLoadedOlderMessagesRef = useRef(false);

  const userParticipant = game?.participants.find(p => p.userId === user?.id);
  const isParticipant = !!userParticipant;
  const isPlayingParticipant = userParticipant?.isPlaying ?? false;
  const isAdminOrOwner = game && user ? isUserGameAdminOrOwner(game, user.id) : (userParticipant?.role === 'ADMIN' || userParticipant?.role === 'OWNER');
  const hasPendingInvite = game?.invites?.some(invite => invite.receiverId === user?.id) ?? false;
  const isGuest = game?.participants.some(p => p.userId === user?.id && !p.isPlaying && p.role !== 'OWNER' && p.role !== 'ADMIN') ?? false;
  
  const isBugCreator = bug?.senderId === user?.id;
  const isBugAdmin = user?.isAdmin;
  const isBugParticipant = bug?.participants?.some(p => p.userId === user?.id) ?? false;
  const canWriteBugChat = contextType === 'BUG' && (isBugCreator || isBugAdmin || isBugParticipant);
  
  const canAccessChat = contextType === 'USER' || (contextType === 'BUG' && canWriteBugChat) || (contextType === 'GAME' && (isParticipant || hasPendingInvite || isGuest || isAdminOrOwner));
  const canViewPublicChat = contextType === 'USER' || contextType === 'BUG' || canAccessChat || game?.isPublic;
  const isCurrentUserGuest = game?.participants?.some(participant => participant.userId === user?.id && !participant.isPlaying && participant.role !== 'OWNER' && participant.role !== 'ADMIN') ?? false;

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
          const response = await chatApi.getUserChats();
          const foundChat = response.data?.find((c: UserChatType) => c.id === id);
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
      }
      return null;
    } catch (error) {
      console.error('Failed to load context:', error);
      navigate(contextType === 'BUG' ? '/bugs' : '/');
      return null;
    } finally {
      setIsLoadingContext(false);
    }
  }, [id, contextType, navigate, userChat, user?.id]);

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
      } else {
        response = await chatApi.getMessages(contextType, id, pageNum, 50, currentChatType);
      }
      
      if (append) {
        setMessages(prev => [...response, ...prev]);
      } else {
        setMessages(response);
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
      }
      
      setHasMoreMessages(response.length === 50);
      
      if (!append) {
        setIsLoadingMessages(false);
        setTimeout(() => {
          setIsInitialLoad(false);
        }, 500);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      if (!append) {
        setIsLoadingMessages(false);
        setIsInitialLoad(false);
      }
    }
  }, [id, contextType, currentChatType]);

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
      setMessages(prevMessages => 
        prevMessages.filter(message => message.id !== messageId)
      );
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
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      const messagesContainer = messageElement.closest('.overflow-y-auto');
      
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
        await gamesApi.joinAsGuest(id);
        await loadContext();
      } catch (error) {
        console.error('Failed to join as guest:', error);
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
    }
  }, [id, contextType, loadContext]);

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
        navigate(-1);
      } else if (contextType === 'BUG') {
        await bugsApi.leaveChat(id);
        await loadContext();
      }
    } catch (error) {
      console.error('Failed to leave chat:', error);
    } finally {
      setIsLeavingChat(false);
      setShowLeaveConfirmation(false);
    }
  }, [id, contextType, isLeavingChat, loadContext, navigate]);

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
      const response = await chatApi.getMessages(contextType, id!, 1, 50, newChatType);
      
      if (id && user?.id && contextType === 'GAME') {
        const markReadResponse = await chatApi.markAllMessagesAsRead(id, [newChatType]);
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
      availableTypes.push('PRIVATE');
      availableTypes.push('ADMINS');
      return availableTypes;
    }
    
    if (!isParticipant) return availableTypes;
    if (!isPlayingParticipant) return availableTypes;
    
    availableTypes.push('PRIVATE');
    
    return availableTypes;
  }, [contextType, isParticipant, isPlayingParticipant, isAdminOrOwner, game?.status]);

  const handleNewMessage = useCallback((message: ChatMessage) => {
    if (isSendingRef.current || message.senderId === user?.id) {
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
    
    const matchesChatType = contextType === 'USER' || message.chatType === currentChatType;
    if (matchesChatType) {
      setMessages(prevMessages => {
        const exists = prevMessages.some(msg => msg.id === message.id);
        if (exists) {
          return prevMessages;
        }
        return [...prevMessages, message];
      });
    }
  }, [contextType, currentChatType, user?.id]);

  const handleMessageReaction = useCallback((reaction: any) => {
    if (reaction.action === 'removed') {
      setMessages(prevMessages => 
        prevMessages.map(message => {
          if (message.id === reaction.messageId) {
            return {
              ...message,
              reactions: message.reactions.filter(r => r.userId !== reaction.userId)
            };
          }
          return message;
        })
      );
    } else {
      setMessages(prevMessages => 
        prevMessages.map(message => {
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
        })
      );
    }
  }, []);

  const handleReadReceipt = useCallback((readReceipt: any) => {
    setMessages(prevMessages => 
      prevMessages.map(message => {
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
      })
    );
  }, []);

  const handleMessageDeleted = useCallback((data: { messageId: string }) => {
    setMessages(prevMessages => 
      prevMessages.filter(message => message.id !== data.messageId)
    );
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!id || !user?.id) return;
      
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
      
      if (initialChatType && initialChatType !== 'PUBLIC' && contextType === 'GAME') {
        if (currentChatType !== initialChatType) {
          await handleChatTypeChange(initialChatType);
        } else {
          await loadMessages();
        }
      } else {
        await loadMessages();
      }
      
      if (contextType === 'GAME' && loadedContext) {
        const loadedGame = loadedContext as Game;
        const loadedUserParticipant = loadedGame.participants.find(p => p.userId === user.id);
        const loadedIsParticipant = !!loadedUserParticipant;
        const loadedIsPlayingParticipant = loadedUserParticipant?.isPlaying ?? false;
        const loadedIsAdminOrOwner = loadedUserParticipant?.role === 'ADMIN' || loadedUserParticipant?.role === 'OWNER';
        const loadedHasPendingInvite = loadedGame.invites?.some(invite => invite.receiverId === user.id) ?? false;
        const loadedIsGuest = loadedGame.participants.some(p => p.userId === user.id && !p.isPlaying) ?? false;
        
        if (loadedIsParticipant || loadedHasPendingInvite || loadedIsGuest || loadedGame.isPublic) {
          try {
            const availableChatTypes: ChatType[] = [];
            if (loadedGame.status && loadedGame.status !== 'ANNOUNCED') {
              availableChatTypes.push('PHOTOS');
            }
            availableChatTypes.push('PUBLIC');
            if (loadedIsParticipant && loadedIsPlayingParticipant) {
              availableChatTypes.push('PRIVATE');
            }
            if (loadedIsParticipant && loadedIsAdminOrOwner) {
              availableChatTypes.push('ADMINS');
            }
            
            const gameUnreadResponse = await chatApi.getGameUnreadCount(id);
            const gameUnreadCount = gameUnreadResponse.data.count || 0;
            
            await chatApi.markAllMessagesAsRead(id, availableChatTypes);
            
            const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
            const newCount = Math.max(0, unreadMessages - gameUnreadCount);
            setUnreadMessages(newCount);
          } catch (error) {
            console.error('Failed to mark all messages as read:', error);
          }
        }
      }
    };
    
    loadData();
  }, [loadContext, loadMessages, id, user?.id, initialChatType, currentChatType, handleChatTypeChange, contextType, userChat]);

  useEffect(() => {
    if (!id) return;

    const setupSocket = async () => {
      if (contextType === 'GAME') {
        console.log('[GameChat] Joining game room:', id);
        await socketService.joinGameRoom(id);
      } else if (contextType === 'BUG') {
        console.log('[GameChat] Joining bug room:', id);
        await socketService.joinBugRoom(id);
      } else if (contextType === 'USER') {
        console.log('[GameChat] Joining user chat room:', id);
        await socketService.joinUserChatRoom(id);
      }
    };

    setupSocket();

    const newMessageEvent = contextType === 'BUG' ? 'new-bug-message' : contextType === 'USER' ? 'new-user-chat-message' : 'new-message';
    const reactionEvent = contextType === 'BUG' ? 'bug-message-reaction' : contextType === 'USER' ? 'user-chat-message-reaction' : 'message-reaction';
    const readReceiptEvent = contextType === 'BUG' ? 'bug-read-receipt' : contextType === 'USER' ? 'user-chat-read-receipt' : 'read-receipt';
    const deletedEvent = contextType === 'BUG' ? 'bug-message-deleted' : contextType === 'USER' ? 'user-chat-message-deleted' : 'message-deleted';

    console.log('[GameChat] Listening to events:', { newMessageEvent, reactionEvent, readReceiptEvent, deletedEvent });

    socketService.on(newMessageEvent, handleNewMessage);
    socketService.on(reactionEvent, handleMessageReaction);
    socketService.on(readReceiptEvent, handleReadReceipt);
    socketService.on(deletedEvent, handleMessageDeleted);

    return () => {
      if (contextType === 'GAME') {
        socketService.leaveGameRoom(id);
      } else if (contextType === 'BUG') {
        socketService.leaveBugRoom(id);
      } else if (contextType === 'USER') {
        socketService.leaveUserChatRoom(id);
      }
      
      socketService.off(newMessageEvent, handleNewMessage);
      socketService.off(reactionEvent, handleMessageReaction);
      socketService.off(readReceiptEvent, handleReadReceipt);
      socketService.off(deletedEvent, handleMessageDeleted);
    };
  }, [id, contextType, handleNewMessage, handleMessageReaction, handleReadReceipt, handleMessageDeleted]);

  useEffect(() => {
    if (justLoadedOlderMessagesRef.current) {
      return;
    }
    
    if (!isLoadingMessages && !isSwitchingChatType && !isLoadingMore && !isInitialLoad && messages.length > 0) {
      const scrollToBottom = () => {
        const messagesContainer = document.querySelector('.overflow-y-auto');
        if (messagesContainer) {
          messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth'
          });
        }
      };
      
      requestAnimationFrame(() => {
        requestAnimationFrame(scrollToBottom);
      });
    }
  }, [isLoadingMessages, isSwitchingChatType, isLoadingMore, isInitialLoad, messages.length]);

  if (isLoadingContext) {
    return (
      <div className="chat-container bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 z-40 shadow-lg" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
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
          />
        </main>
      </div>
    );
  }

  if (!game && !bug && !userChat) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {contextType === 'BUG' ? 'Bug not found' : contextType === 'USER' ? 'Chat not found' : 'Game not found'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {contextType === 'BUG' ? "The bug you're looking for doesn't exist." : contextType === 'USER' ? "The chat you're looking for doesn't exist." : "The game you're looking for doesn't exist."}
          </p>
          <button
            onClick={() => navigate(contextType === 'BUG' ? '/bugs' : '/')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            {contextType === 'BUG' ? 'Go to Bugs' : 'Go Home'}
          </button>
        </div>
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
      return `${otherUser.firstName} ${otherUser.lastName}`;
    }
    return 'Chat';
  };

  const getSubtitle = () => {
    if (contextType === 'GAME' && game) {
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


  return (
    <div className="chat-container bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 z-40 shadow-lg" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
            >
              <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
            </button>
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
        </div>

        {contextType === 'GAME' && ((isParticipant && isPlayingParticipant) || isAdminOrOwner || (game?.status && game.status !== 'ANNOUNCED')) && (
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

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <MessageList
          messages={messages}
          onAddReaction={handleAddReaction}
          onRemoveReaction={handleRemoveReaction}
          onDeleteMessage={handleDeleteMessage}
          onReplyMessage={handleReplyMessage}
          isLoading={isLoadingMore}
          isLoadingMessages={isLoadingMessages || isInitialLoad}
          isSwitchingChatType={isSwitchingChatType}
          onScrollToMessage={handleScrollToMessage}
          hasMoreMessages={hasMoreMessages}
          onLoadMore={loadMoreMessages}
          isInitialLoad={isInitialLoad}
          isLoadingMore={isLoadingMore}
        />
      </main>

      {!isInitialLoad && (
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {isBlockedByUser && contextType === 'USER' ? (
          <div className="px-4 py-3 animate-in slide-in-from-bottom-4 duration-300" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
            <div className="text-sm text-center text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
              {t('chat.blockedByUser')}
            </div>
          </div>
        ) : canAccessChat ? (
          <div className="relative overflow-hidden">
            <div 
              className={`transition-transform duration-300 ease-in-out ${
                isSendingMessage ? '-translate-y-full' : 'translate-y-0'
              }`}
            >
              <MessageInput
                gameId={contextType === 'GAME' ? id : undefined}
                bugId={contextType === 'BUG' ? id : undefined}
                userChatId={contextType === 'USER' ? id : undefined}
                onMessageSent={handleMessageSent}
                disabled={false}
                replyTo={replyTo}
                onCancelReply={handleCancelReply}
                onScrollToMessage={handleScrollToMessage}
                chatType={currentChatType}
              />
            </div>
            <div 
              className={`absolute inset-0 bg-white dark:bg-gray-800 p-4 flex items-center justify-center transition-transform duration-300 ease-in-out ${
                isSendingMessage ? 'translate-y-0' : 'translate-y-full'
              }`}
            >
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">{t('common.sending')}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 animate-in slide-in-from-bottom-4 duration-300" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
            <div className="flex items-center justify-center">
              <button
                onClick={handleJoinAsGuest}
                disabled={isJoiningAsGuest}
                className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <MessageCircle size={20} />
                {isJoiningAsGuest ? t('common.loading') : t('chat.joinChatToSend')}
              </button>
            </div>
          </div>
        )}
      </footer>
      )}

      {contextType === 'GAME' && showParticipantsModal && game && (
        <ChatParticipantsModal
          game={game}
          onClose={() => setShowParticipantsModal(false)}
          onGuestLeave={handleGuestLeave}
          currentChatType={currentChatType}
        />
      )}

      {(contextType === 'GAME' || contextType === 'BUG') && (
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
