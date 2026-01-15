import React, { useRef, useEffect, useState } from 'react';
import { ChatMessage } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { UnifiedMessageMenu } from './UnifiedMessageMenu';
import { ReplyPreview } from './ReplyPreview';
import { useMessageReadTracking } from '@/hooks/useMessageReadTracking';
import { DoubleTickIcon } from './DoubleTickIcon';
import { formatDate } from '@/utils/dateFormat';
import { resolveDisplaySettings, formatGameTime } from '@/utils/displayPreferences';
import { PlayerCardBottomSheet } from './PlayerCardBottomSheet';
import { parseSystemMessage, useSystemMessageTranslation } from '@/utils/systemMessages';
import { FullscreenImageViewer } from './FullscreenImageViewer';
import { ReportMessageModal } from './ReportMessageModal';
import { parseMentions } from '@/utils/parseMentions';
import { extractLanguageCode } from '@/utils/language';

interface ContextMenuState {
  isOpen: boolean;
  messageId: string | null;
  position: { x: number; y: number };
}

interface MessageItemProps {
  message: ChatMessage;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: ChatMessage) => void;
  contextMenuState: ContextMenuState;
  onOpenContextMenu: (messageId: string, position: { x: number; y: number }) => void;
  onCloseContextMenu: () => void;
  allMessages?: ChatMessage[];
  onScrollToMessage?: (messageId: string) => void;
  disableReadTracking?: boolean;
  isChannel?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({
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
  disableReadTracking = false,
  isChannel = false,
}) => {
  const { user } = useAuthStore();
  const { translateSystemMessage } = useSystemMessageTranslation();
  const messageRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPlayerCard, setShowPlayerCard] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [reportMessage, setReportMessage] = useState<ChatMessage | null>(null);
  const [selectedMentionUserId, setSelectedMentionUserId] = useState<string | null>(null);
  const [currentMessage, setCurrentMessage] = useState(message);
  const isOwnMessage = currentMessage.senderId === user?.id;
  const isSystemMessage = !currentMessage.senderId;
  const { observeMessage, unobserveMessage } = useMessageReadTracking(disableReadTracking);
  
  const isMenuOpen = contextMenuState.isOpen && contextMenuState.messageId === currentMessage.id;

  useEffect(() => {
    setCurrentMessage(message);
  }, [message]);

  // Parse system message data
  const systemMessageData = isSystemMessage ? parseSystemMessage(currentMessage.content) : null;
  const displayContent = systemMessageData 
    ? translateSystemMessage(systemMessageData)
    : currentMessage.content;

  const parsedContent = isSystemMessage ? null : parseMentions(displayContent);

  const userLanguageCode = user?.language ? extractLanguageCode(user.language).toLowerCase() : 'en';
  
  // Support both translation (singular) and translations (array) for backward compatibility
  let matchingTranslation = currentMessage.translation;
  if (currentMessage.translations && currentMessage.translations.length > 0) {
    matchingTranslation = currentMessage.translations.find(
      t => t.languageCode.toLowerCase() === userLanguageCode
    ) || currentMessage.translation;
  }
  
  const hasTranslation = matchingTranslation && 
    matchingTranslation.languageCode.toLowerCase() === userLanguageCode;
  const translationContent = hasTranslation && matchingTranslation ? parseMentions(matchingTranslation.translation) : null;

  const getSenderName = () => {
    if (isSystemMessage) {
      return 'System';
    }
    if (currentMessage.sender?.firstName && currentMessage.sender?.lastName) {
      return `${currentMessage.sender.firstName} ${currentMessage.sender.lastName}`;
    }
    return currentMessage.sender?.firstName || 'Unknown';
  };

  const handleTranslationUpdate = (messageId: string, translation: { languageCode: string; translation: string }) => {
    if (messageId === currentMessage.id) {
      setCurrentMessage({
        ...currentMessage,
        translation,
        translations: currentMessage.translations 
          ? [...currentMessage.translations.filter(t => t.languageCode !== translation.languageCode), translation]
          : [translation]
      });
    }
  };

  const getThumbnailUrl = (index: number): string => {
    if (currentMessage.thumbnailUrls && currentMessage.thumbnailUrls[index]) {
      return currentMessage.thumbnailUrls[index] || '';
    }
    // Fallback to original URL if thumbnail not available
    return currentMessage.mediaUrls[index] || '';
  };

  const handleImageClick = (imageUrl: string) => {
    setFullscreenImage(imageUrl || '');
  };

  const displaySettings = user ? resolveDisplaySettings(user) : null;
  
  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (messageDate.getTime() === today.getTime()) {
      return displaySettings ? formatGameTime(dateString, displaySettings) : formatDate(date, 'HH:mm');
    } else {
      const timePart = displaySettings ? formatGameTime(dateString, displaySettings) : formatDate(date, 'HH:mm');
      return `${formatDate(date, 'MMM d')} ${timePart}`;
    }
  };


  const handleCopyMessage = (message: ChatMessage) => {
    navigator.clipboard.writeText(message.content);
  };


  const handleQuickReaction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const currentReaction = getCurrentUserReaction();
    if (currentReaction === '❤️') {
      onRemoveReaction(currentMessage.id);
    } else {
      onAddReaction(currentMessage.id, '❤️');
    }
  };

  const getCurrentUserReaction = () => {
    return currentMessage.reactions.find(r => r.userId === user?.id)?.emoji;
  };

  const getReactionCounts = () => {
    const counts: { [emoji: string]: number } = {};
    currentMessage.reactions.forEach(reaction => {
      counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
    });
    return counts;
  };

  const getReplyCount = () => {
    return allMessages.filter(msg => msg.replyToId === currentMessage.id).length;
  };

  const hasReplies = () => {
    return getReplyCount() > 0;
  };

  const handleScrollToReplies = () => {
    if (onScrollToMessage && hasReplies()) {
      const replies = allMessages.filter(msg => msg.replyToId === currentMessage.id);
      if (replies.length > 0) {
        onScrollToMessage(replies[0].id);
      }
    }
  };

  const handleDeleteStart = (messageId: string) => {
    if (messageId === currentMessage.id) {
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
    const senderId = currentMessage.senderId;
    if (element && !isOwnMessage && senderId) {
      observeMessage(element, currentMessage.id, senderId);
    }
    
    return () => {
      if (element) {
        unobserveMessage(element);
      }
    };
  }, [currentMessage.id, currentMessage.senderId, isOwnMessage, observeMessage, unobserveMessage]);

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
        onOpenContextMenu(currentMessage.id, { x: clientX, y: clientY });
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
        onOpenContextMenu(currentMessage.id, { x: clientX, y: clientY });
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
  }, [currentMessage.id, onOpenContextMenu]);

  return (
    <>
      {isSystemMessage ? (
        <div className="flex justify-center mb-4">
          <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 max-w-[80%]">
            <p className="text-xs text-gray-600 dark:text-gray-300 text-center">{displayContent}</p>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 block text-center mt-1">
              {formatMessageTime(currentMessage.createdAt)}
            </span>
          </div>
        </div>
      ) : (
        <div
          ref={messageRef}
          className={`group flex select-none ${isChannel ? 'justify-start' : (isOwnMessage ? 'justify-end' : 'justify-start')} mb-4 relative transition-all duration-300 ease-out ${
            isDeleting 
              ? 'opacity-0 scale-75 translate-y-[-20px] transform-gpu' 
              : 'opacity-100 scale-100 translate-y-0'
          }`}
        >
          
          <div className={`flex ${isChannel ? 'w-full max-w-full' : 'max-w-[85%]'} ${isChannel ? 'flex-row' : (isOwnMessage ? 'flex-row-reverse' : 'flex-row')}`}>
            {(!isOwnMessage || isChannel) && (
              <div className="flex-shrink-0 mr-3 self-center">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowPlayerCard(true);
                  }}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer"
                >
                  {currentMessage.sender?.avatar ? (
                    <img
                      src={currentMessage.sender.avatar || ''}
                      alt={getSenderName()}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    getSenderName().charAt(0).toUpperCase()
                  )}
                </button>
              </div>
            )}
            
            <div className={`flex flex-col ${isChannel ? 'items-start flex-1' : (isOwnMessage ? 'items-end' : 'items-start')}`}>
              {(isChannel || !isOwnMessage) && (
                <span className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 px-2">{getSenderName()}</span>
              )}
              
              <div className="relative">
                {currentMessage.replyTo && (
                  <ReplyPreview
                    replyTo={currentMessage.replyTo}
                    onScrollToMessage={onScrollToMessage}
                    className="mb-1"
                  />
                )}
                
                <div 
                  className={`flex items-start select-none ${isChannel ? 'flex-row' : (isOwnMessage ? 'flex-row-reverse' : 'flex-row')}`}
                >
                  <div
                    className={`px-4 py-2 rounded-lg shadow-sm relative min-w-[120px] ${
                      isChannel
                        ? 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200'
                        : isOwnMessage
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                          : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {hasTranslation ? (
                      <div className="space-y-2">
                        <div className="pb-2 border-b border-gray-300 dark:border-gray-600">
                          <p className="text-sm whitespace-pre-wrap break-words pr-12">
                            {parsedContent ? (
                              parsedContent.map((part, index) => {
                                if (part.type === 'mention') {
                                  const isMentioned = currentMessage.mentionIds?.includes(part.userId || '') || user?.id === part.userId;
                                  return (
                                    <span
                                      key={index}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (part.userId) {
                                          setSelectedMentionUserId(part.userId);
                                        }
                                      }}
                                      className={`font-semibold cursor-pointer hover:underline ${
                                        isChannel
                                          ? isMentioned
                                            ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1 rounded'
                                            : 'text-blue-600 dark:text-blue-400'
                                          : isOwnMessage
                                            ? isMentioned
                                              ? 'text-yellow-200 bg-yellow-500/30 px-1 rounded'
                                              : 'text-blue-100'
                                            : isMentioned
                                              ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1 rounded'
                                              : 'text-blue-600 dark:text-blue-400'
                                      }`}
                                    >
                                      @{part.display}
                                    </span>
                                  );
                                }
                                return <span key={index}>{part.content}</span>;
                              })
                            ) : (
                              <span>{displayContent}</span>
                            )}
                          </p>
                        </div>
                        <div className={`${isChannel ? 'text-gray-600 dark:text-gray-400' : (isOwnMessage ? 'text-blue-50' : 'text-gray-600 dark:text-gray-400')}`}>
                          <p className="text-sm whitespace-pre-wrap break-words pr-12">
                            {translationContent ? (
                              translationContent.map((part, index) => {
                                if (part.type === 'mention') {
                                  const isMentioned = currentMessage.mentionIds?.includes(part.userId || '') || user?.id === part.userId;
                                  return (
                                    <span
                                      key={index}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (part.userId) {
                                          setSelectedMentionUserId(part.userId);
                                        }
                                      }}
                                      className={`font-semibold cursor-pointer hover:underline ${
                                        isOwnMessage
                                          ? isMentioned
                                            ? 'text-yellow-200 bg-yellow-500/30 px-1 rounded'
                                            : 'text-blue-50'
                                          : isMentioned
                                          ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1 rounded'
                                          : 'text-blue-600 dark:text-blue-400'
                                      }`}
                                    >
                                      @{part.display}
                                    </span>
                                  );
                                }
                                return <span key={index}>{part.content}</span>;
                              })
                            ) : (
                              <span>{currentMessage.translation?.translation}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap break-words pr-12 pb-3">
                        {parsedContent ? (
                          parsedContent.map((part, index) => {
                            if (part.type === 'mention') {
                              const isMentioned = currentMessage.mentionIds?.includes(part.userId || '') || user?.id === part.userId;
                              return (
                                <span
                                  key={index}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (part.userId) {
                                      setSelectedMentionUserId(part.userId);
                                    }
                                  }}
                                      className={`font-semibold cursor-pointer hover:underline ${
                                        isChannel
                                          ? isMentioned
                                            ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1 rounded'
                                            : 'text-blue-600 dark:text-blue-400'
                                          : isOwnMessage
                                            ? isMentioned
                                              ? 'text-yellow-200 bg-yellow-500/30 px-1 rounded'
                                              : 'text-blue-100'
                                            : isMentioned
                                              ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1 rounded'
                                              : 'text-blue-600 dark:text-blue-400'
                                      }`}
                                >
                                  @{part.display}
                                </span>
                              );
                            }
                            return <span key={index}>{part.content}</span>;
                          })
                      ) : (
                        displayContent
                      )}
                    </p>
                    )}
                    
                    {currentMessage.mediaUrls && currentMessage.mediaUrls.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {currentMessage.mediaUrls.map((url, index) => (
                          <div key={index} className="rounded-lg overflow-hidden">
                            <div
                              onClick={() => handleImageClick(url)}
                              className="cursor-pointer hover:opacity-90 transition-opacity"
                            >
                              <img
                                src={getThumbnailUrl(index)}
                                alt={`Media ${index + 1}`}
                                className="max-w-full h-auto rounded-lg max-h-64 object-cover"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Time and read status inside bubble */}
                    <div className={`absolute bottom-1 right-2 flex items-center gap-1 ${isChannel ? 'text-gray-400 dark:text-gray-500' : (isOwnMessage ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500')}`}>
                      <span className="text-[10px]">{formatMessageTime(message.createdAt)}</span>
                      {isOwnMessage && (
                        <div className="flex items-center">
                          {currentMessage.readReceipts && currentMessage.readReceipts.length > 0 ? (
                            <div className="text-purple-200" title={`Read by ${currentMessage.readReceipts.length} ${currentMessage.readReceipts.length === 1 ? 'person' : 'people'}`}>
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
                    
                    {currentMessage.reactions.length > 0 && (
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
        <UnifiedMessageMenu
          message={currentMessage}
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
          onReport={(msg) => setReportMessage(msg)}
          onTranslationUpdate={handleTranslationUpdate}
        />
      )}

      {reportMessage && (
        <ReportMessageModal
          isOpen={!!reportMessage}
          message={reportMessage}
          onClose={() => setReportMessage(null)}
        />
      )}
      
      {showPlayerCard && !isSystemMessage && (
        <PlayerCardBottomSheet
          playerId={currentMessage.senderId!}
          onClose={() => setShowPlayerCard(false)}
        />
      )}

      {selectedMentionUserId && (
        <PlayerCardBottomSheet
          playerId={selectedMentionUserId}
          onClose={() => setSelectedMentionUserId(null)}
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
