import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { chatApi, ChatMessage } from '@/api/chat';
import { gamesApi } from '@/api/games';
import { Game, ChatType } from '@/types';
import { MessageList } from '@/components/MessageList';
import { MessageInput } from '@/components/MessageInput';
import { ChatParticipantsModal } from '@/components/ChatParticipantsModal';
import { ChatParticipantsButton } from '@/components/ChatParticipantsButton';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { formatDate } from '@/utils/dateFormat';
import { socketService } from '@/services/socketService';
import { MessageCircle, ArrowLeft, MapPin, LogOut, ArrowDown } from 'lucide-react';

export const GameChat: React.FC = () => {
  const { t } = useTranslation();
  const { id: gameId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const [game, setGame] = useState<Game | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSwitchingChatType, setIsSwitchingChatType] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);
  const [currentChatType, setCurrentChatType] = useState<ChatType>('PUBLIC');
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [isLeavingChat, setIsLeavingChat] = useState(false);

  const userParticipant = game?.participants.find(p => p.userId === user?.id);
  const isParticipant = !!userParticipant;
  const isPlayingParticipant = userParticipant?.isPlaying ?? false;
  const isAdminOrOwner = userParticipant?.role === 'ADMIN' || userParticipant?.role === 'OWNER';
  const hasPendingInvite = game?.invites?.some(invite => invite.receiverId === user?.id) ?? false;
  const isGuest = game?.participants.some(p => p.userId === user?.id && !p.isPlaying && p.role !== 'OWNER' && p.role !== 'ADMIN') ?? false;
  const canAccessChat = isParticipant || hasPendingInvite || isGuest;
  const canViewPublicChat = canAccessChat || game?.isPublic;
  const isCurrentUserGuest = game?.participants?.some(participant => participant.userId === user?.id && !participant.isPlaying && participant.role !== 'OWNER' && participant.role !== 'ADMIN') ?? false;

  const loadGame = useCallback(async () => {
    if (!gameId) return null;
    
    try {
      const response = await gamesApi.getById(gameId);
      setGame(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to load game:', error);
      navigate('/');
      return null;
    } finally {
      setIsLoadingGame(false);
    }
  }, [gameId, navigate]);

  const loadMessages = useCallback(async (pageNum = 1, append = false) => {
    if (!gameId) return;
    
    try {
      const response = await chatApi.getGameMessages(gameId, pageNum, 50, currentChatType);
      
      if (append) {
        setMessages(prev => [...response, ...prev]);
      } else {
        setMessages(response);
        // Scroll to bottom after loading messages (not when appending for pagination)
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
  }, [gameId, currentChatType]);

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
      // Real-time updates will be handled by Socket.IO events
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  }, []);

  const handleRemoveReaction = useCallback(async (messageId: string) => {
    try {
      await chatApi.removeReaction(messageId);
      // Real-time updates will be handled by Socket.IO events
    } catch (error) {
      console.error('Failed to remove reaction:', error);
    }
  }, []);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      // Immediately update UI for better UX
      setMessages(prevMessages => 
        prevMessages.filter(message => message.id !== messageId)
      );
      
      await chatApi.deleteMessage(messageId);
      // Real-time updates will be handled by Socket.IO events
    } catch (error) {
      console.error('Failed to delete message:', error);
      // Revert the UI change if the API call failed
      // We could reload messages here, but for now we'll let the socket event handle it
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
      // Get the messages container to calculate proper positioning
      const messagesContainer = messageElement.closest('.overflow-y-auto');
      
      if (messagesContainer) {
        // Calculate the position to center the message in the visible area
        const messageOffsetTop = messageElement.offsetTop;
        const containerHeight = messagesContainer.clientHeight;
        const messageHeight = messageElement.offsetHeight;
        
        // Center the message in the container with some padding
        const targetScrollTop = messageOffsetTop - (containerHeight / 2) + (messageHeight / 2);
        
        messagesContainer.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      } else {
        // Fallback to default scrollIntoView
        messageElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
      
      // Add a temporary highlight effect with animation
      messageElement.classList.add('message-highlight', 'ring-2', 'ring-blue-500', 'ring-opacity-50', 'bg-blue-50', 'dark:bg-blue-900/20');
      setTimeout(() => {
        messageElement.classList.remove('message-highlight', 'ring-2', 'ring-blue-500', 'ring-opacity-50', 'bg-blue-50', 'dark:bg-blue-900/20');
      }, 3000);
    }
  }, []);

  const handleJoinAsGuest = useCallback(async () => {
    if (!gameId) return;
    
    setIsJoiningAsGuest(true);
    try {
      await gamesApi.joinAsGuest(gameId);
      // Reload the game data to update the guest status
      await loadGame();
    } catch (error) {
      console.error('Failed to join as guest:', error);
    } finally {
      setIsJoiningAsGuest(false);
    }
  }, [gameId, loadGame]);

  const handleGuestLeave = useCallback(async () => {
    await loadGame(); // Reload game to update guest status
  }, [loadGame]);

  const handleLeaveChat = useCallback(async () => {
    if (!gameId || isLeavingChat) return;
    
    setIsLeavingChat(true);
    try {
      await gamesApi.leave(gameId);
      await loadGame();
      navigate(-1);
    } catch (error) {
      console.error('Failed to leave chat:', error);
    } finally {
      setIsLeavingChat(false);
      setShowLeaveConfirmation(false);
    }
  }, [gameId, isLeavingChat, loadGame, navigate]);

  const handleChatTypeChange = useCallback(async (newChatType: ChatType) => {
    if (newChatType === currentChatType) return;
    
    const startTime = Date.now();
    setIsSwitchingChatType(true);
    setCurrentChatType(newChatType);
    setPage(1);
    setHasMoreMessages(true);
    
    try {
      const response = await chatApi.getGameMessages(gameId!, 1, 50, newChatType);
      
      if (gameId && user?.id) {
        const markReadResponse = await chatApi.markAllMessagesAsRead(gameId, [newChatType]);
        const markedCount = markReadResponse.data.count || 0;
        
        const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
        const newCount = Math.max(0, unreadMessages - markedCount);
        setUnreadMessages(newCount);
      }
      
      // Ensure at least 1.5 seconds have passed since loading started for parallel transition
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 1500 - elapsedTime);
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
      
      setMessages(response);
      setHasMoreMessages(response.length === 50);
      
      // Scroll to bottom after switching chat types
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
  }, [currentChatType, gameId, user?.id]);

  // Determine which chat types the user can access
  const getAvailableChatTypes = useCallback((): ChatType[] => {
    if (!isParticipant) return ['PUBLIC'];
    if (!isPlayingParticipant) return ['PUBLIC'];
    if (!isAdminOrOwner) return ['PUBLIC', 'PRIVATE'];
    return ['PUBLIC', 'PRIVATE', 'ADMINS'];
  }, [isParticipant, isPlayingParticipant, isAdminOrOwner]);

  // Socket.IO event handlers
  const handleNewMessage = useCallback((message: ChatMessage) => {
    // Only add messages that match the current chat type
    if (message.chatType !== currentChatType) return;
    
    setMessages(prevMessages => {
      // Check if message already exists to avoid duplicates
      const exists = prevMessages.some(msg => msg.id === message.id);
      if (exists) return prevMessages;
      
      return [...prevMessages, message];
    });
  }, [currentChatType]);

  const handleMessageReaction = useCallback((reaction: any) => {
    if (reaction.action === 'removed') {
      // Handle reaction removal
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
      // Handle reaction addition/update
      setMessages(prevMessages => 
        prevMessages.map(message => {
          if (message.id === reaction.messageId) {
            const existingReaction = message.reactions.find(r => r.userId === reaction.userId);
            if (existingReaction) {
              // Update existing reaction
              return {
                ...message,
                reactions: message.reactions.map(r => 
                  r.userId === reaction.userId ? { ...r, emoji: reaction.emoji } : r
                )
              };
            } else {
              // Add new reaction
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
      if (!gameId || !user?.id) return;
      
      const loadedGame = await loadGame();
      await loadMessages();
      
      if (!loadedGame) return;
      
      const loadedUserParticipant = loadedGame.participants.find(p => p.userId === user.id);
      const loadedIsParticipant = !!loadedUserParticipant;
      const loadedIsPlayingParticipant = loadedUserParticipant?.isPlaying ?? false;
      const loadedIsAdminOrOwner = loadedUserParticipant?.role === 'ADMIN' || loadedUserParticipant?.role === 'OWNER';
      const loadedHasPendingInvite = loadedGame.invites?.some(invite => invite.receiverId === user.id) ?? false;
      const loadedIsGuest = loadedGame.participants.some(p => p.userId === user.id && !p.isPlaying) ?? false;
      
      if (loadedIsParticipant || loadedHasPendingInvite || loadedIsGuest || loadedGame.isPublic) {
        try {
          const availableChatTypes: ChatType[] = [];
          availableChatTypes.push('PUBLIC');
          if (loadedIsParticipant && loadedIsPlayingParticipant) {
            availableChatTypes.push('PRIVATE');
          }
          if (loadedIsParticipant && loadedIsAdminOrOwner) {
            availableChatTypes.push('ADMINS');
          }
          
          const gameUnreadResponse = await chatApi.getGameUnreadCount(gameId);
          const gameUnreadCount = gameUnreadResponse.data.count || 0;
          
          await chatApi.markAllMessagesAsRead(gameId, availableChatTypes);
          
          const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
          const newCount = Math.max(0, unreadMessages - gameUnreadCount);
          setUnreadMessages(newCount);
        } catch (error) {
          console.error('Failed to mark all messages as read:', error);
        }
      }
    };
    
    loadData();
  }, [loadGame, loadMessages, gameId, user?.id]);

  // Note: Messages are now loaded directly in handleChatTypeChange to avoid double loading

  // Socket.IO setup
  useEffect(() => {
    if (!gameId) return;

    const setupSocket = async () => {
      // Join game room
      await socketService.joinGameRoom(gameId);
    };

    setupSocket();

    // Set up event listeners
    socketService.on('new-message', handleNewMessage);
    socketService.on('message-reaction', handleMessageReaction);
    socketService.on('read-receipt', handleReadReceipt);
    socketService.on('message-deleted', handleMessageDeleted);

    return () => {
      // Leave game room
      socketService.leaveGameRoom(gameId);
      
      // Remove event listeners
      socketService.off('new-message', handleNewMessage);
      socketService.off('message-reaction', handleMessageReaction);
      socketService.off('read-receipt', handleReadReceipt);
      socketService.off('message-deleted', handleMessageDeleted);
    };
  }, [gameId, handleNewMessage, handleMessageReaction, handleReadReceipt, handleMessageDeleted]);


  if (isLoadingGame) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Game not found</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">The game you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Go Home
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
          <p className="text-gray-600 dark:text-gray-400 mb-6">You don't have access to this game chat.</p>
          <button
            onClick={() => navigate(`/games/${gameId}`)}
            className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            View Game
          </button>
        </div>
      </div>
    );
  }

  const getGameTitle = () => {
    if (game.name) return game.name;
    if (game.club) return `${game.club.name}`;
    return `${game.gameType} Game`;
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 shadow-lg" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                {!game.name && <MapPin size={16} className="text-gray-500 dark:text-gray-400" />}
                {getGameTitle()}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(game.startTime, 'PPP')} • {formatDate(game.startTime, 'p')} - {formatDate(game.endTime, 'p')}
              </p>
            </div>
          </div>
          
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
              game={game} 
              onClick={() => setShowParticipantsModal(true)}
            />
          </div>
        </div>
      </div>

      {/* Chat Type Selector */}
      {isParticipant && isPlayingParticipant && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-2xl mx-auto px-4">
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
                  {t(`chat.types.${chatType}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Messages Container */}
      <div className="flex-1 flex flex-col min-h-0">
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

        {/* Load More Button */}
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
      </div>

      {/* Message Input */}
      <div className="flex-shrink-0">
        {canAccessChat ? (
          <div className="animate-in slide-in-from-bottom-4 duration-300">
            <MessageInput
              gameId={gameId!}
              onMessageSent={() => {}} // No need to refresh since we get real-time updates
              disabled={false}
              replyTo={replyTo}
              onCancelReply={handleCancelReply}
              onScrollToMessage={handleScrollToMessage}
              chatType={currentChatType}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3 animate-in slide-in-from-bottom-4 duration-300">
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
      </div>

      {/* Participants Modal */}
      {showParticipantsModal && game && (
        <ChatParticipantsModal
          game={game}
          onClose={() => setShowParticipantsModal(false)}
          onGuestLeave={handleGuestLeave}
          currentChatType={currentChatType}
        />
      )}

      {/* Leave Chat Confirmation Modal */}
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
    </div>
  );
};