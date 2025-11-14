import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { chatApi, ChatMessage, ChatContextType, UserChat as UserChatType } from '@/api/chat';
import { gamesApi } from '@/api/games';
import { bugsApi } from '@/api/bugs';
import { Game, ChatType, Bug } from '@/types';
import { MessageList } from '@/components/MessageList';
import { MessageInput } from '@/components/MessageInput';
import { ChatParticipantsModal } from '@/components/ChatParticipantsModal';
import { ChatParticipantsButton } from '@/components/ChatParticipantsButton';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { CachedImage } from '@/components/CachedImage';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { formatDate } from '@/utils/dateFormat';
import { UrlConstructor } from '@/utils/urlConstructor';
import { socketService } from '@/services/socketService';
import { MessageCircle, ArrowLeft, MapPin, LogOut, ArrowDown, Camera, Bug as BugIcon } from 'lucide-react';

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
  const [page, setPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);
  const [currentChatType, setCurrentChatType] = useState<ChatType>(initialChatType || 'PUBLIC');
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [isLeavingChat, setIsLeavingChat] = useState(false);

  const userParticipant = game?.participants.find(p => p.userId === user?.id);
  const isParticipant = !!userParticipant;
  const isPlayingParticipant = userParticipant?.isPlaying ?? false;
  const isAdminOrOwner = userParticipant?.role === 'ADMIN' || userParticipant?.role === 'OWNER';
  const hasPendingInvite = game?.invites?.some(invite => invite.receiverId === user?.id) ?? false;
  const isGuest = game?.participants.some(p => p.userId === user?.id && !p.isPlaying && p.role !== 'OWNER' && p.role !== 'ADMIN') ?? false;
  const canAccessChat = contextType === 'USER' || contextType === 'BUG' || isParticipant || hasPendingInvite || isGuest;
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
        const response = await bugsApi.getBugs({ page: 1, limit: 100 });
        const foundBug = response.data.bugs.find((b: Bug) => b.id === id);
        if (!foundBug) throw new Error('Bug not found');
        setBug(foundBug);
        return foundBug;
      } else if (contextType === 'USER') {
        if (!userChat) {
          const response = await chatApi.getUserChats();
          const foundChat = response.data?.find((c: UserChatType) => c.id === id);
          if (foundChat) setUserChat(foundChat);
          return foundChat;
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
  }, [id, contextType, navigate, userChat]);

  const loadMessages = useCallback(async (pageNum = 1, append = false) => {
    if (!id) return;
    
    try {
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
        setTimeout(() => {
          const messagesContainer = document.querySelector('.overflow-y-auto');
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }, 100);
      }
      
      setHasMoreMessages(response.length === 50);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }, [id, contextType, currentChatType]);

  const loadMoreMessages = useCallback(async () => {
    if (!hasMoreMessages || isLoadingMore) return;
    
    setIsLoadingMore(true);
    const nextPage = page + 1;
    await loadMessages(nextPage, true);
    setPage(nextPage);
    setIsLoadingMore(false);
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
    if (!id || contextType !== 'GAME') return;
    
    setIsJoiningAsGuest(true);
    try {
      await gamesApi.joinAsGuest(id);
      await loadContext();
    } catch (error) {
      console.error('Failed to join as guest:', error);
    } finally {
      setIsJoiningAsGuest(false);
    }
  }, [id, contextType, loadContext]);

  const handleGuestLeave = useCallback(async () => {
    await loadContext();
  }, [loadContext]);

  const handleLeaveChat = useCallback(async () => {
    if (!id || isLeavingChat || contextType !== 'GAME') return;
    
    setIsLeavingChat(true);
    try {
      await gamesApi.leave(id);
      await loadContext();
      navigate(-1);
    } catch (error) {
      console.error('Failed to leave chat:', error);
    } finally {
      setIsLeavingChat(false);
      setShowLeaveConfirmation(false);
    }
  }, [id, contextType, isLeavingChat, loadContext, navigate]);

  const handleChatTypeChange = useCallback(async (newChatType: ChatType) => {
    if (newChatType === currentChatType || contextType === 'USER') return;
    
    const startTime = Date.now();
    setIsSwitchingChatType(true);
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
      
      setTimeout(() => {
        const messagesContainer = document.querySelector('.overflow-y-auto');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 100);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsSwitchingChatType(false);
    }
  }, [currentChatType, contextType, id, user?.id]);

  const getAvailableChatTypes = useCallback((): ChatType[] => {
    if (contextType !== 'GAME') return ['PUBLIC'];
    
    const availableTypes: ChatType[] = [];
    
    if (game?.status && game.status !== 'ANNOUNCED') {
      availableTypes.push('PHOTOS');
    }
    
    availableTypes.push('PUBLIC');
    
    if (!isParticipant) return availableTypes;
    if (!isPlayingParticipant) return availableTypes;
    
    availableTypes.push('PRIVATE');
    
    if (isAdminOrOwner) {
      availableTypes.push('ADMINS');
    }
    
    return availableTypes;
  }, [contextType, isParticipant, isPlayingParticipant, isAdminOrOwner, game?.status]);

  const handleNewMessage = useCallback((message: ChatMessage) => {
    console.log('[GameChat] New message received:', message, 'contextType:', contextType, 'currentChatType:', currentChatType);
    if (contextType === 'USER' || message.chatType === currentChatType) {
      setMessages(prevMessages => {
        const exists = prevMessages.some(msg => msg.id === message.id);
        if (exists) {
          console.log('[GameChat] Message already exists, skipping');
          return prevMessages;
        }
        console.log('[GameChat] Adding new message to list');
        return [...prevMessages, message];
      });
    } else {
      console.log('[GameChat] Message not matching chat type, skipping');
    }
  }, [contextType, currentChatType]);

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
      
      const loadedContext = await loadContext();
      
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
  }, [loadContext, loadMessages, id, user?.id, initialChatType, currentChatType, handleChatTypeChange, contextType]);

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

  if (isLoadingContext) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
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
      return bug.text.length > 25 ? `${bug.text.substring(0, 25)}...` : bug.text;
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
            <CachedImage
              src={UrlConstructor.constructImageUrl(otherUser.avatar)}
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

  const headerHeight = contextType === 'GAME' && ((isParticipant && isPlayingParticipant) || (game?.status && game.status !== 'ANNOUNCED')) 
    ? 'calc(7rem + env(safe-area-inset-top))' 
    : 'calc(4rem + env(safe-area-inset-top))';

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 fixed top-0 right-0 left-0 z-40 shadow-lg" style={{ paddingTop: 'env(safe-area-inset-top)', height: headerHeight }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
            </button>
            {getIcon()}
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                {getTitle()}
              </h1>
              {getSubtitle() && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {getSubtitle()}
                </p>
              )}
            </div>
          </div>
          
          {contextType === 'GAME' && (
            <div className="flex items-center gap-2">
              {isCurrentUserGuest && (
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
        </div>

        {contextType === 'GAME' && ((isParticipant && isPlayingParticipant) || (game?.status && game.status !== 'ANNOUNCED')) && (
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

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ paddingTop: headerHeight, paddingBottom: '3.5rem' }}>
        <MessageList
          messages={messages}
          onAddReaction={handleAddReaction}
          onRemoveReaction={handleRemoveReaction}
          onDeleteMessage={handleDeleteMessage}
          onReplyMessage={handleReplyMessage}
          isLoading={isLoadingMore}
          isSwitchingChatType={isSwitchingChatType}
          onScrollToMessage={handleScrollToMessage}
        />

        {hasMoreMessages && (
          <div className="flex-shrink-0 px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-center">
            <button
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
              className="py-3 px-6 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-lg shadow-primary-500/50 hover:shadow-xl hover:shadow-primary-600/60 transition-all duration-300 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <span>{isLoadingMore ? t('common.loading') : t('chat.messages.loadMore')}</span>
              {!isLoadingMore && <ArrowDown size={16} className="animate-bounce" />}
            </button>
          </div>
        )}
      </main>

      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 fixed bottom-0 right-0 left-0 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {canAccessChat ? (
          <div className="animate-in slide-in-from-bottom-4 duration-300">
            <MessageInput
              gameId={contextType === 'GAME' ? id : undefined}
              bugId={contextType === 'BUG' ? id : undefined}
              userChatId={contextType === 'USER' ? id : undefined}
              onMessageSent={() => {}}
              disabled={false}
              replyTo={replyTo}
              onCancelReply={handleCancelReply}
              onScrollToMessage={handleScrollToMessage}
              chatType={currentChatType}
            />
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

      {contextType === 'GAME' && showParticipantsModal && game && (
        <ChatParticipantsModal
          game={game}
          onClose={() => setShowParticipantsModal(false)}
          onGuestLeave={handleGuestLeave}
          currentChatType={currentChatType}
        />
      )}

      {contextType === 'GAME' && (
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
