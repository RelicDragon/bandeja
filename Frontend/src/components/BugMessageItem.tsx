import React, { useRef, useEffect, useState } from 'react';
import { BugMessage } from '@/api/bugChat';
import { useAuthStore } from '@/store/authStore';
import { BugUnifiedMessageMenu } from './BugUnifiedMessageMenu';
import { ReplyPreview } from './ReplyPreview';
import { useMessageReadTracking } from '@/hooks/useMessageReadTracking';
import { DoubleTickIcon } from './DoubleTickIcon';
import { formatDate } from '@/utils/dateFormat';
import { PlayerCardBottomSheet } from './PlayerCardBottomSheet';
import { CachedImage } from './CachedImage';
import { parseSystemMessage, useSystemMessageTranslation } from '@/utils/systemMessages';
import { FullscreenImageViewer } from './FullscreenImageViewer';
import { UrlConstructor } from '@/utils/urlConstructor';

interface ContextMenuState {
  isOpen: boolean;
  messageId: string | null;
  position: { x: number; y: number };
}

interface BugMessageItemProps {
  message: BugMessage;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: BugMessage) => void;
  contextMenuState: ContextMenuState;
  onOpenContextMenu: (messageId: string, position: { x: number; y: number }) => void;
  onCloseContextMenu: () => void;
  allMessages?: BugMessage[];
  onScrollToMessage?: (messageId: string) => void;
}

export const BugMessageItem: React.FC<BugMessageItemProps> = ({
  message,
  onAddReaction,
  onRemoveReaction,
  onDeleteMessage,
  onReplyMessage,
  contextMenuState,
  onOpenContextMenu,
  onCloseContextMenu,
  allMessages = [],
  onScrollToMessage,
}) => {
  const { user } = useAuthStore();
  const { translateSystemMessage } = useSystemMessageTranslation();
  const messageRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPlayerCard, setShowPlayerCard] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const isOwnMessage = message.senderId === user?.id;
  const isSystemMessage = !message.senderId;
  const { observeMessage, unobserveMessage } = useMessageReadTracking();
  
  const isMenuOpen = contextMenuState.isOpen && contextMenuState.messageId === message.id;

  // Parse system message data
  const systemMessageData = isSystemMessage ? parseSystemMessage(message.content) : null;
  const displayContent = systemMessageData 
    ? translateSystemMessage(systemMessageData)
    : message.content;

  const getSenderName = () => {
    if (isSystemMessage) {
      return 'System';
    }
    if (message.sender?.firstName && message.sender?.lastName) {
      return `${message.sender.firstName} ${message.sender.lastName}`;
    }
    return message.sender?.firstName || 'Unknown';
  };

  const getThumbnailUrl = (index: number): string => {
    if (message.thumbnailUrls && message.thumbnailUrls[index]) {
      return UrlConstructor.constructImageUrl(message.thumbnailUrls[index]);
    }
    // Fallback to original URL if thumbnail not available
    return UrlConstructor.constructImageUrl(message.mediaUrls[index]);
  };

  const handleImageClick = (imageUrl: string) => {
    setFullscreenImage(UrlConstructor.constructImageUrl(imageUrl));
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (messageDate.getTime() === today.getTime()) {
      return formatDate(date, 'HH:mm');
    } else {
      return formatDate(date, 'MMM d HH:mm');
    }
  };


  const handleCopyMessage = (message: BugMessage) => {
    navigator.clipboard.writeText(message.content);
  };


  const handleQuickReaction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const currentReaction = getCurrentUserReaction();
    if (currentReaction === '❤️') {
      onRemoveReaction(message.id);
    } else {
      onAddReaction(message.id, '❤️');
    }
  };

  const getCurrentUserReaction = () => {
    return message.reactions.find(r => r.userId === user?.id)?.emoji;
  };

  const getReactionCounts = () => {
    const counts: { [emoji: string]: number } = {};
    message.reactions.forEach(reaction => {
      counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
    });
    return counts;
  };

  const getReplyCount = () => {
    return allMessages.filter(msg => msg.replyToId === message.id).length;
  };

  const hasReplies = () => {
    return getReplyCount() > 0;
  };

  const handleScrollToReplies = () => {
    if (onScrollToMessage && hasReplies()) {
      const replies = allMessages.filter(msg => msg.replyToId === message.id);
      if (replies.length > 0) {
        onScrollToMessage(replies[0].id);
      }
    }
  };

  const handleDeleteStart = (messageId: string) => {
    if (messageId === message.id) {
      setIsDeleting(true);
    }
  };

  useEffect(() => {
    // Cleanup long press timer on unmount
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Prevent browser context menu when our custom menu is open
    const preventContextMenu = (e: Event) => {
      e.preventDefault();
    };

    if (isMenuOpen) {
      document.addEventListener('contextmenu', preventContextMenu, { capture: true, passive: false });
    }

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu, { capture: true });
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const element = messageRef.current;
    if (element && !isOwnMessage && message.senderId) {
      observeMessage(element, message.id, message.senderId);
    }
    
    return () => {
      if (element) {
        unobserveMessage(element);
      }
    };
  }, [message.id, message.senderId, isOwnMessage, observeMessage, unobserveMessage]);

  useEffect(() => {
    // Add native DOM event listeners to prevent context menu and handle long press
    const messageElement = messageRef.current;
    if (!messageElement) return;

    // Find the message bubble element (the actual content bubble)
    const messageBubble = messageElement.querySelector('[class*="px-4 py-2 rounded-lg"]') as HTMLElement;
    // Find the reaction button
    const reactionButton = messageElement.querySelector('button[class*="hover:bg-gray-100"]') as HTMLElement;
    
    if (!messageBubble && !reactionButton) return;

    const preventContextMenu = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleMouseDown = (e: MouseEvent) => {
      const clientX = e.clientX;
      const clientY = e.clientY;
      
      longPressTimer.current = setTimeout(() => {
        onOpenContextMenu(message.id, { x: clientX, y: clientY });
      }, 500);
    };

    const handleMouseUp = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const handleMouseLeave = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;
      
      longPressTimer.current = setTimeout(() => {
        onOpenContextMenu(message.id, { x: clientX, y: clientY });
      }, 500);
    };

    const handleTouchEnd = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const handleTouchCancel = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    // Only prevent context menu on the entire message element
    messageElement.addEventListener('contextmenu', preventContextMenu, { passive: false });
    
    // Add long press handlers to the message bubble content
    if (messageBubble) {
      messageBubble.addEventListener('mousedown', handleMouseDown, { passive: true });
      messageBubble.addEventListener('mouseup', handleMouseUp, { passive: true });
      messageBubble.addEventListener('mouseleave', handleMouseLeave, { passive: true });
      messageBubble.addEventListener('touchstart', handleTouchStart, { passive: true });
      messageBubble.addEventListener('touchend', handleTouchEnd, { passive: true });
      messageBubble.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    }
    
    // Add long press handlers to the reaction button
    if (reactionButton) {
      reactionButton.addEventListener('mousedown', handleMouseDown, { passive: true });
      reactionButton.addEventListener('mouseup', handleMouseUp, { passive: true });
      reactionButton.addEventListener('mouseleave', handleMouseLeave, { passive: true });
      reactionButton.addEventListener('touchstart', handleTouchStart, { passive: true });
      reactionButton.addEventListener('touchend', handleTouchEnd, { passive: true });
      reactionButton.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    }

    return () => {
      messageElement.removeEventListener('contextmenu', preventContextMenu);
      
      if (messageBubble) {
        messageBubble.removeEventListener('mousedown', handleMouseDown);
        messageBubble.removeEventListener('mouseup', handleMouseUp);
        messageBubble.removeEventListener('mouseleave', handleMouseLeave);
        messageBubble.removeEventListener('touchstart', handleTouchStart);
        messageBubble.removeEventListener('touchend', handleTouchEnd);
        messageBubble.removeEventListener('touchcancel', handleTouchCancel);
      }
      
      if (reactionButton) {
        reactionButton.removeEventListener('mousedown', handleMouseDown);
        reactionButton.removeEventListener('mouseup', handleMouseUp);
        reactionButton.removeEventListener('mouseleave', handleMouseLeave);
        reactionButton.removeEventListener('touchstart', handleTouchStart);
        reactionButton.removeEventListener('touchend', handleTouchEnd);
        reactionButton.removeEventListener('touchcancel', handleTouchCancel);
      }
    };
  }, [message.id, onOpenContextMenu]);

  return (
    <>
      {isSystemMessage ? (
        <div className="flex justify-center mb-4">
          <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 max-w-[80%]">
            <p className="text-xs text-gray-600 dark:text-gray-300 text-center">{displayContent}</p>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 block text-center mt-1">
              {formatMessageTime(message.createdAt)}
            </span>
          </div>
        </div>
      ) : (
        <div
          ref={messageRef}
          className={`group flex select-none ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4 relative transition-all duration-300 ease-out ${
            isDeleting 
              ? 'opacity-0 scale-75 translate-y-[-20px] transform-gpu' 
              : 'opacity-100 scale-100 translate-y-0'
          }`}
        >
          
          <div className={`flex max-w-[85%] ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
            {!isOwnMessage && (
              <div className="flex-shrink-0 mr-3 self-center">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowPlayerCard(true);
                  }}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
                >
                  {message.sender?.avatar ? (
                    <CachedImage
                      src={UrlConstructor.constructImageUrl(message.sender.avatar)}
                      alt={getSenderName()}
                      className="w-8 h-8 rounded-full object-cover"
                      showLoadingSpinner={true}
                      loadingClassName="rounded-full"
                    />
                  ) : (
                    getSenderName().charAt(0).toUpperCase()
                  )}
                </button>
              </div>
            )}
            
            <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
              {!isOwnMessage && (
                <span className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 px-2">{getSenderName()}</span>
              )}
              
              <div className="relative">
                {message.replyTo && (
                  <ReplyPreview
                    replyTo={message.replyTo}
                    onScrollToMessage={onScrollToMessage}
                    className="mb-1"
                  />
                )}
                
                <div 
                  className={`flex items-start select-none ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div
                    className={`px-4 py-2 rounded-lg shadow-sm relative min-w-[120px] ${
                      isOwnMessage
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                        : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words pr-12 pb-3">{message.content}</p>
                    
                    {message.mediaUrls && message.mediaUrls.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.mediaUrls.map((url, index) => (
                          <div key={index} className="rounded-lg overflow-hidden">
                            <div
                              onClick={() => handleImageClick(url)}
                              className="cursor-pointer hover:opacity-90 transition-opacity"
                            >
                              <CachedImage
                                src={getThumbnailUrl(index)}
                                alt={`Media ${index + 1}`}
                                className="max-w-full h-auto rounded-lg max-h-64 object-cover"
                                showLoadingSpinner={true}
                                loadingClassName="rounded-lg"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Time and read status inside bubble */}
                    <div className={`absolute bottom-1 right-2 flex items-center gap-1 ${isOwnMessage ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
                      <span className="text-[10px]">{formatMessageTime(message.createdAt)}</span>
                      {isOwnMessage && (
                        <div className="flex items-center">
                          {message.readReceipts && message.readReceipts.length > 0 ? (
                            <div className="text-purple-200" title={`Read by ${message.readReceipts.length} ${message.readReceipts.length === 1 ? 'person' : 'people'}`}>
                              <DoubleTickIcon size={14} variant="double" />
                            </div>
                          ) : (
                            <div className="text-blue-100" title="Sent">
                              <DoubleTickIcon size={14} variant="secondary" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Reply counter positioned absolutely under bubble */}
                  {hasReplies() && (
                    <div className={`absolute top-[calc(100%-2px)] ${isOwnMessage ? 'right-1' : 'left-2'} z-10`}>
                      <button
                        onClick={handleScrollToReplies}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] transition-colors ${
                          isOwnMessage 
                            ? 'text-blue-500 bg-blue-50 hover:text-blue-600 hover:bg-blue-100' 
                            : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                        title={`${getReplyCount()} ${getReplyCount() === 1 ? 'reply' : 'replies'}`}
                      >
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        <span>{getReplyCount()}</span>
                      </button>
                    </div>
                  )}
                  
                  <div className={`flex items-center gap-1 ${isOwnMessage ? 'flex-row-reverse mr-1' : 'flex-row ml-1'} self-center`}>
                    {/* Simple reaction display */}
                    <button 
                      onClick={handleQuickReaction}
                      className="relative flex flex-col items-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full p-1 transition-colors"
                    >
                      <span className="text-lg">
                        {getCurrentUserReaction() || (
                          <span className="text-gray-600 dark:text-white">♡</span>
                        )}
                      </span>
                      <span className={`text-xs text-gray-500 dark:text-gray-400 -mt-1 ${getCurrentUserReaction() && getReactionCounts()[getCurrentUserReaction()!] > 1 ? 'visible' : 'invisible'}`}>
                        {getCurrentUserReaction() ? getReactionCounts()[getCurrentUserReaction()!] || '1' : '1'}
                      </span>
                    </button>
                    
                    {message.reactions.length > 0 && (
                      <div className="flex gap-1">
                        {Object.entries(getReactionCounts()).map(([emoji, count]) => {
                          const isUserReaction = getCurrentUserReaction() === emoji;
                          
                          // Don't show user's reaction here - it's shown in the button
                          if (isUserReaction) return null;
                          
                          return (
                            <div
                              key={emoji}
                              className="relative flex flex-col items-center"
                              onMouseDown={(e) => e.stopPropagation()}
                              onMouseUp={(e) => e.stopPropagation()}
                              onMouseLeave={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                              onTouchEnd={(e) => e.stopPropagation()}
                              onTouchCancel={(e) => e.stopPropagation()}
                            >
                              <span className="text-sm">{emoji}</span>
                              <span className={`text-xs text-gray-500 dark:text-gray-400 -mt-1 ${count > 1 ? 'visible' : 'invisible'}`}>
                                {count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {isMenuOpen && !isSystemMessage && (
        <BugUnifiedMessageMenu
          message={message}
          isOwnMessage={isOwnMessage}
          currentReaction={getCurrentUserReaction()}
          onReply={onReplyMessage}
          onCopy={handleCopyMessage}
          onDelete={onDeleteMessage}
          onReactionSelect={onAddReaction}
          onReactionRemove={onRemoveReaction}
          onClose={onCloseContextMenu}
          messageElementRef={messageRef}
          onDeleteStart={handleDeleteStart}
        />
      )}
      
      {showPlayerCard && !isSystemMessage && (
        <PlayerCardBottomSheet
          playerId={message.senderId!}
          onClose={() => setShowPlayerCard(false)}
        />
      )}

      {fullscreenImage && (
        <FullscreenImageViewer
          imageUrl={fullscreenImage}
          onClose={() => setFullscreenImage(null)}
        />
      )}
    </>
  );
};
