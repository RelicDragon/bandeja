import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { bugChatApi, BugMessage } from '@/api/bugChat';
import { bugsApi } from '@/api/bugs';
import { Bug } from '@/types';
import { BugMessageList } from '@/components/BugMessageList';
import { MessageInput } from '@/components/MessageInput';
import { formatDate } from '@/utils/dateFormat';
import { socketService } from '@/services/socketService';
import { ArrowLeft, Bug as BugIcon, ArrowDown } from 'lucide-react';

export const BugChat: React.FC = () => {
  const { t } = useTranslation();
  const { id: bugId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [bug, setBug] = useState<Bug | null>(null);
  const [messages, setMessages] = useState<BugMessage[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [replyTo, setReplyTo] = useState<BugMessage | null>(null);
  const [isLoadingBug, setIsLoadingBug] = useState(true);

  const loadBug = useCallback(async () => {
    if (!bugId) return;

    try {
      const response = await bugsApi.getBugs({ page: 1, limit: 100 });
      const foundBug = response.data.bugs.find((b: Bug) => b.id === bugId);
      if (!foundBug) {
        throw new Error('Bug not found');
      }
      setBug(foundBug);
    } catch (error) {
      console.error('Failed to load bug:', error);
      navigate('/bugs');
    } finally {
      setIsLoadingBug(false);
    }
  }, [bugId, navigate]);

  const loadMessages = useCallback(async (pageNum = 1, append = false) => {
    if (!bugId) return;

    try {
      const response = await bugChatApi.getBugMessages(bugId, pageNum, 50, 'PUBLIC');

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
  }, [bugId]);

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
      await bugChatApi.addReaction(messageId, { emoji });
      // Real-time updates will be handled by Socket.IO events
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  }, []);

  const handleRemoveReaction = useCallback(async (messageId: string) => {
    try {
      await bugChatApi.removeReaction(messageId);
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

      await bugChatApi.deleteMessage(messageId);
      // Real-time updates will be handled by Socket.IO events
    } catch (error) {
      console.error('Failed to delete message:', error);
      // Revert the UI change if the API call failed
      // We could reload messages here, but for now we'll let the socket event handle it
    }
  }, []);

  const handleReplyMessage = useCallback((message: BugMessage) => {
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



  // Socket.IO event handlers
  const handleNewMessage = useCallback((message: BugMessage) => {
    // Only add PUBLIC messages
    if (message.chatType !== 'PUBLIC') return;

    setMessages(prevMessages => {
      // Check if message already exists to avoid duplicates
      const exists = prevMessages.some(msg => msg.id === message.id);
      if (exists) return prevMessages;

      return [...prevMessages, message];
    });
  }, []);

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
      await Promise.all([loadBug(), loadMessages()]);
    };

    loadData();
  }, [loadBug, loadMessages]);

  // Socket.IO setup
  useEffect(() => {
    if (!bugId) return;

    const setupSocket = async () => {
      // Join bug room
      await socketService.joinBugRoom(bugId);
    };

    setupSocket();

    // Set up event listeners
    socketService.on('new-bug-message', handleNewMessage);
    socketService.on('bug-message-reaction', handleMessageReaction);
    socketService.on('bug-read-receipt', handleReadReceipt);
    socketService.on('bug-message-deleted', handleMessageDeleted);

    return () => {
      // Leave bug room
      socketService.leaveBugRoom(bugId);

      // Remove event listeners
      socketService.off('new-bug-message', handleNewMessage);
      socketService.off('bug-message-reaction', handleMessageReaction);
      socketService.off('bug-read-receipt', handleReadReceipt);
      socketService.off('bug-message-deleted', handleMessageDeleted);
    };
  }, [bugId, handleNewMessage, handleMessageReaction, handleReadReceipt, handleMessageDeleted]);


  if (isLoadingBug) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      </div>
    );
  }

  if (!bug) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Bug not found</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">The bug you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate('/bugs')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Go to Bugs
          </button>
        </div>
      </div>
    );
  }


  const getBugTitle = () => {
    return bug.text.length > 25 ? `${bug.text.substring(0, 25)}...` : bug.text;
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
                <BugIcon size={16} className="text-red-500" />
                {getBugTitle()}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(bug.createdAt, 'PPP')} • {t(`bug.types.${bug.bugType}`)} • {t(`bug.statuses.${bug.status}`)}
              </p>
            </div>
          </div>
        </div>
      </div>


      {/* Messages Container */}
      <div className="flex-1 flex flex-col min-h-0">
        <BugMessageList
          messages={messages}
          onAddReaction={handleAddReaction}
          onRemoveReaction={handleRemoveReaction}
          onDeleteMessage={handleDeleteMessage}
          onReplyMessage={handleReplyMessage}
          isLoading={isLoadingMore}
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
        <div className="animate-in slide-in-from-bottom-4 duration-300">
          <MessageInput
            bugId={bugId!}
            onMessageSent={() => {}} // No need to refresh since we get real-time updates
            disabled={false}
            replyTo={replyTo}
            onCancelReply={handleCancelReply}
            onScrollToMessage={handleScrollToMessage}
            chatType="PUBLIC"
          />
        </div>
      </div>
    </div>
  );
};
