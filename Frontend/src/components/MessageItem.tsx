import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { UnifiedMessageMenu } from './UnifiedMessageMenu';
import { ReplyPreview } from './ReplyPreview';
import { useMessageReadTracking } from '@/hooks/useMessageReadTracking';
import { DoubleTickIcon } from './DoubleTickIcon';
import { formatDate } from '@/utils/dateFormat';
import { resolveDisplaySettings, formatGameTime } from '@/utils/displayPreferences';
import { PlayerCardBottomSheet } from './PlayerCardBottomSheet';
import { formatSystemMessageForDisplay, SystemMessageType } from '@/utils/systemMessages';
import { FullscreenImageViewer } from './FullscreenImageViewer';
import { PollMessage } from './chat/PollMessage';
import { ReportMessageModal } from './ReportMessageModal';
import { parseMentions } from '@/utils/parseMentions';
import { parseUrls } from '@/utils/parseUrls';
import { extractLanguageCode } from '@/utils/language';
import { AlertCircle, Pencil } from 'lucide-react';

interface ContextMenuState {
  isOpen: boolean;
  messageId: string | null;
  position: { x: number; y: number };
}

interface MessageItemProps {
  message: ChatMessageWithStatus | ChatMessage;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage) => void;
  onPollUpdated?: (messageId: string, updatedPoll: import('@/api/chat').Poll) => void;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  contextMenuState: ContextMenuState;
  onOpenContextMenu: (messageId: string, position: { x: number; y: number }) => void;
  onCloseContextMenu: () => void;
  allMessages?: ChatMessage[];
  onScrollToMessage?: (messageId: string) => void;
  disableReadTracking?: boolean;
  isChannel?: boolean;
  userChatUser1Id?: string;
  userChatUser2Id?: string;
  onChatRequestRespond?: (messageId: string, accepted: boolean) => void;
  isPinned?: boolean;
  onPin?: (message: ChatMessage) => void;
  onUnpin?: (messageId: string) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onAddReaction,
  onRemoveReaction,
  onDeleteMessage,
  onReplyMessage,
  onEditMessage,
  onPollUpdated,
  onResendQueued,
  onRemoveFromQueue,
  contextMenuState,
  onOpenContextMenu,
  onCloseContextMenu,
  allMessages = [],
  onScrollToMessage,
  disableReadTracking = false,
  isChannel = false,
  userChatUser1Id,
  userChatUser2Id,
  onChatRequestRespond,
  isPinned = false,
  onPin,
  onUnpin,
}) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const messageRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPlayerCard, setShowPlayerCard] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [reportMessage, setReportMessage] = useState<ChatMessage | null>(null);
  const [selectedMentionUserId, setSelectedMentionUserId] = useState<string | null>(null);
  const [showFailedMenu, setShowFailedMenu] = useState(false);
  const [respondingToRequest, setRespondingToRequest] = useState(false);
  const [currentMessage, setCurrentMessage] = useState(message);
  const isOwnMessage = currentMessage.senderId === user?.id;
  const isSystemMessage = !currentMessage.senderId;
  const isSending = (currentMessage as ChatMessageWithStatus)._status === 'SENDING';
  const isFailed = (currentMessage as ChatMessageWithStatus)._status === 'FAILED';
  const isOffline = isSending || isFailed;
  const optimisticId = (currentMessage as ChatMessageWithStatus)._optimisticId;
  const { observeMessage, unobserveMessage } = useMessageReadTracking(disableReadTracking);

  const isMenuOpen = contextMenuState.isOpen && contextMenuState.messageId === currentMessage.id;

  useLayoutEffect(() => {
    setCurrentMessage(message);
  }, [message]);

  useEffect(() => {
    if (!showFailedMenu) return;
    const onDocClick = (e: MouseEvent) => {
      if (messageRef.current?.contains(e.target as Node)) return;
      setShowFailedMenu(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showFailedMenu]);

  const displayContent = isSystemMessage
    ? formatSystemMessageForDisplay(currentMessage.content, t)
    : currentMessage.content;

  const parseContentWithMentionsAndUrls = (text: string) => {
    const mentionParts = parseMentions(text);
    const result: Array<{ type: 'mention' | 'url' | 'text'; content: string; userId?: string; display?: string; url?: string; displayText?: string }> = [];

    mentionParts.forEach(part => {
      if (part.type === 'mention') {
        result.push(part);
      } else {
        const urlParts = parseUrls(part.content);
        result.push(...urlParts);
      }
    });

    return result;
  };

  const parsedContent = isSystemMessage ? null : parseContentWithMentionsAndUrls(displayContent);

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
  const translationContent = hasTranslation && matchingTranslation ? parseContentWithMentionsAndUrls(matchingTranslation.translation) : null;

  const getSenderName = () => {
    if (isSystemMessage) {
      return 'System';
    }
    if (currentMessage.sender?.firstName && currentMessage.sender?.lastName) {
      return `${currentMessage.sender.firstName || ''} ${currentMessage.sender.lastName || ''}`.trim();
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

  const getImageGridLayout = (count: number) => {
    if (count === 1) {
      return { gridTemplateColumns: '1fr', gridTemplateRows: 'auto', gap: '0', singleImage: true };
    } else if (count === 2) {
      return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto', gap: '0' };
    } else if (count === 3) {
      return {
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: 'auto auto',
        gap: '0',
        firstImageSpan: true
      };
    } else if (count === 4) {
      return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto auto', gap: '0' };
    } else if (count >= 5 && count <= 6) {
      return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'auto auto', gap: '0' };
    } else {
      return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'auto', gap: '0' };
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

  const isReactionPending = () => {
    const r = currentMessage.reactions.find(r => r.userId === user?.id);
    return !!(r && (r as { _pending?: boolean })._pending);
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
    if (isOffline) return false;
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
    const messageElement = messageRef.current;
    if (!messageElement) return;

    const messageBubble = messageElement.querySelector('[data-message-bubble="true"]') as HTMLElement;
    const reactionButton = messageElement.querySelector('[data-reaction-button="true"]') as HTMLElement;

    if (!messageBubble) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let menuWasOpened = false;
    const scrollThreshold = 10;

    const clearTimer = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const stopEventIfMenuOpened = (e: Event) => {
      if (menuWasOpened) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const preventContextMenu = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleMouseDown = (e: MouseEvent) => {
      menuWasOpened = false;
      const clientX = e.clientX;
      const clientY = e.clientY;

      longPressTimer.current = setTimeout(() => {
        if (isOffline) return;
        menuWasOpened = true;
        onOpenContextMenu(currentMessage.id, { x: clientX, y: clientY });
      }, 500);
    };

    const handleMouseUp = (e: MouseEvent) => {
      clearTimer();
      stopEventIfMenuOpened(e);
    };

    const handleClick = (e: MouseEvent) => {
      if (menuWasOpened) {
        stopEventIfMenuOpened(e);
        menuWasOpened = false;
      }
    };

    const handleMouseLeave = () => {
      clearTimer();
    };

    const handleTouchStart = (e: TouchEvent) => {
      menuWasOpened = false;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;

      longPressTimer.current = setTimeout(() => {
        if (isOffline) return;
        menuWasOpened = true;
        onOpenContextMenu(currentMessage.id, { x: clientX, y: clientY });
      }, 500);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!longPressTimer.current) return;

      const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY);

      if (deltaX > scrollThreshold || deltaY > scrollThreshold) {
        clearTimer();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      clearTimer();
      stopEventIfMenuOpened(e);
    };

    const handleTouchCancel = () => {
      clearTimer();
    };

    const eventConfigs = [
      { event: 'mousedown', handler: handleMouseDown, options: { passive: true } },
      { event: 'mouseup', handler: handleMouseUp, options: { passive: false, capture: true } },
      { event: 'click', handler: handleClick, options: { passive: false, capture: true } },
      { event: 'mouseleave', handler: handleMouseLeave, options: { passive: true } },
      { event: 'touchstart', handler: handleTouchStart, options: { passive: true } },
      { event: 'touchmove', handler: handleTouchMove, options: { passive: true } },
      { event: 'touchend', handler: handleTouchEnd, options: { passive: false, capture: true } },
      { event: 'touchcancel', handler: handleTouchCancel, options: { passive: true } },
    ];

    const attachListeners = (element: HTMLElement) => {
      eventConfigs.forEach(({ event, handler, options }) => {
        element.addEventListener(event, handler as EventListener, options);
      });
    };

    const detachListeners = (element: HTMLElement) => {
      eventConfigs.forEach(({ event, handler, options }) => {
        element.removeEventListener(event, handler as EventListener, options);
      });
    };

    messageElement.addEventListener('contextmenu', preventContextMenu, { passive: false });
    attachListeners(messageBubble);
    if (reactionButton) {
      attachListeners(reactionButton);
    }

    return () => {
      messageElement.removeEventListener('contextmenu', preventContextMenu);
      detachListeners(messageBubble);
      if (reactionButton) {
        detachListeners(reactionButton);
      }
    };
  }, [currentMessage, onOpenContextMenu, isOffline]);

  const parsedRequest = isSystemMessage && currentMessage.content ? (() => {
    try {
      const p = JSON.parse(currentMessage.content);
      return p.type === SystemMessageType.USER_CHAT_REQUEST && !p.responded ? p : null;
    } catch { return null; }
  })() : null;
  const responderId = parsedRequest && userChatUser1Id && userChatUser2Id
    ? (parsedRequest.requesterId === userChatUser1Id ? userChatUser2Id : userChatUser1Id)
    : null;
  const showAcceptDecline = parsedRequest && responderId && user?.id === responderId && onChatRequestRespond;

  return (
    <>
      {isSystemMessage ? (
        <div className="flex justify-center mb-4">
          <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl px-3 py-2 max-w-[80%]">
            <p className="text-xs text-gray-600 dark:text-gray-300 text-center whitespace-pre-wrap break-words break-all overflow-visible" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{displayContent}</p>
            {showAcceptDecline && (
              <div className="flex gap-2 mt-2 justify-center">
                <button
                  onClick={() => {
                    if (respondingToRequest) return;
                    setRespondingToRequest(true);
                    onChatRequestRespond!(currentMessage.id, true);
                    setRespondingToRequest(false);
                  }}
                  disabled={respondingToRequest}
                  className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                >
                  {t('common.accept')}
                </button>
                <button
                  onClick={() => {
                    if (respondingToRequest) return;
                    setRespondingToRequest(true);
                    onChatRequestRespond!(currentMessage.id, false);
                    setRespondingToRequest(false);
                  }}
                  disabled={respondingToRequest}
                  className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                >
                  {t('common.decline')}
                </button>
              </div>
            )}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 block text-center mt-1">
              {formatMessageTime(currentMessage.createdAt)}
            </span>
          </div>
        </div>
      ) : (
        <div
          ref={messageRef}
          className={`group flex select-none ${isChannel ? 'justify-start' : (isOwnMessage ? 'justify-end' : 'justify-start')} mb-4 relative transition-all duration-300 ease-out overflow-visible ${isDeleting
              ? 'opacity-0 scale-75 translate-y-[-20px] transform-gpu'
              : 'opacity-100 scale-100 translate-y-0'
            }`}
        >

          <div className={`flex ${isChannel 
            ? 'w-full max-w-full' 
            : (currentMessage.poll ? 'w-[85%] min-w-[85%] flex-shrink-0' : 'max-w-[85%]')} 
            ${isChannel ? 'flex-row' : (isOwnMessage ? 'flex-row-reverse' : 'flex-row')} 
            overflow-visible`}>

            {!isChannel && !isOwnMessage && (
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

            <div className={`flex flex-col ${isChannel ? 'items-start flex-1' : (isOwnMessage ? 'items-end' : 'items-start')} ${currentMessage.poll ? 'flex-1 min-w-0' : ''} overflow-visible`}>
              {!isChannel && !isOwnMessage && (
                <span className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 px-2">{getSenderName()}</span>
              )}

              <div className={`relative overflow-visible ${currentMessage.poll ? 'w-full' : ''}`}>
                {!isOffline && currentMessage.replyTo && (
                  <ReplyPreview
                    replyTo={currentMessage.replyTo}
                    onScrollToMessage={onScrollToMessage}
                    className="mb-1"
                  />
                )}

                <div
                  className={`flex items-start select-none ${isChannel ? 'flex-row' : (isOwnMessage ? 'flex-row-reverse' : 'flex-row')} ${currentMessage.poll ? 'w-full' : ''} overflow-visible`}
                >
                <div
                  data-message-bubble="true"
                  className={`${currentMessage.mediaUrls && currentMessage.mediaUrls.length > 0 ? '' : 'px-4'} ${hasTranslation ? 'pt-2 pb-4' : (currentMessage.mediaUrls && currentMessage.mediaUrls.length > 0 && currentMessage.content ? 'pt-0 pb-2' : (currentMessage.mediaUrls && currentMessage.mediaUrls.length > 0 ? 'py-0' : 'py-2'))} rounded-2xl shadow-sm relative min-w-[120px] ${currentMessage.mediaUrls && currentMessage.mediaUrls.length > 0 ? 'overflow-hidden' : 'overflow-visible'} ${currentMessage.poll ? 'flex-1 min-w-0' : ''} ${isChannel || currentMessage.poll
                      ? 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200'
                      : isOwnMessage
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                        : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200'
                    }`}
                >
                    {/* Poll Content */}
                    {currentMessage.poll && (
                      <div className="py-1">
                        <PollMessage poll={currentMessage.poll} messageId={currentMessage.id} onPollUpdated={onPollUpdated} />
                      </div>
                    )}

                    {/* Images first - Telegram style */}
                    {currentMessage.mediaUrls && currentMessage.mediaUrls.length > 0 && (
                      <div
                        className="w-full"
                        style={{
                          display: 'grid',
                          ...getImageGridLayout(currentMessage.mediaUrls.length),
                          marginBottom: currentMessage.content ? '8px' : '0',
                        }}
                      >
                        {currentMessage.mediaUrls.map((url, index) => {
                          const layout = getImageGridLayout(currentMessage.mediaUrls.length);
                          const isFirstInThreeLayout = layout.firstImageSpan && index === 0;
                          const isSingleImage = layout.singleImage;

                          return (
                            <div
                              key={index}
                              className="relative overflow-hidden"
                              style={{
                                gridColumn: isFirstInThreeLayout ? '1 / -1' : 'auto',
                                aspectRatio: isSingleImage ? undefined : (isFirstInThreeLayout ? '16/9' : '1'),
                                maxHeight: isSingleImage ? '400px' : undefined,
                                cursor: 'pointer',
                              }}
                              onClick={() => handleImageClick(url)}
                            >
                              <img
                                src={getThumbnailUrl(index)}
                                alt={`Media ${index + 1}`}
                                className={isSingleImage ? "w-full h-auto object-cover" : "w-full h-full object-cover"}
                                style={{ display: 'block', maxHeight: isSingleImage ? '400px' : undefined }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Text content after images - Hide if poll is present as poll has its own question display */}
                    {currentMessage.content && !currentMessage.poll && (
                      <div className={`${currentMessage.mediaUrls && currentMessage.mediaUrls.length > 0 ? 'px-4' : ''} overflow-visible`}>
                        {hasTranslation ? (
                          <div className="space-y-2">
                            <div className="pb-2 border-b border-gray-300 dark:border-gray-600">
                              <p className="text-sm whitespace-pre-wrap break-words break-all pr-12 overflow-visible" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
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
                                          className={`font-semibold cursor-pointer hover:underline ${isChannel
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
                                    } else if (part.type === 'url') {
                                      return (
                                        <a
                                          key={index}
                                          href={part.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (part.url && (part.url.includes(window.location.origin) || part.url.includes('bandeja.me') || part.url.includes('localhost'))) {
                                              e.preventDefault();
                                              try {
                                                const urlObj = new URL(part.url);
                                                navigate(urlObj.pathname + urlObj.search + urlObj.hash);
                                              } catch {
                                                window.open(part.url, '_blank');
                                              }
                                            }
                                          }}
                                          className={`underline ${isChannel
                                              ? 'text-blue-600 dark:text-blue-400'
                                              : isOwnMessage
                                                ? 'text-blue-100'
                                                : 'text-blue-600 dark:text-blue-400'
                                            }`}
                                        >
                                          {part.displayText || part.content}
                                        </a>
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
                              <p className="text-sm whitespace-pre-wrap break-words break-all pr-12 overflow-visible" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
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
                                          className={`font-semibold cursor-pointer hover:underline ${isOwnMessage
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
                                    } else if (part.type === 'url') {
                                      return (
                                        <a
                                          key={index}
                                          href={part.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (part.url && (part.url.includes(window.location.origin) || part.url.includes('bandeja.me') || part.url.includes('localhost'))) {
                                              e.preventDefault();
                                              try {
                                                const urlObj = new URL(part.url);
                                                navigate(urlObj.pathname + urlObj.search + urlObj.hash);
                                              } catch {
                                                window.open(part.url, '_blank');
                                              }
                                            }
                                          }}
                                          className={`underline ${isOwnMessage
                                              ? 'text-blue-50'
                                              : 'text-blue-600 dark:text-blue-400'
                                            }`}
                                        >
                                          {part.displayText || part.content}
                                        </a>
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
                          <p className="text-sm whitespace-pre-wrap break-words break-all pr-12 pb-3 overflow-visible" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
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
                                      className={`font-semibold cursor-pointer hover:underline ${isChannel
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
                                } else if (part.type === 'url') {
                                  return (
                                    <a
                                      key={index}
                                      href={part.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (part.url && (part.url.includes(window.location.origin) || part.url.includes('bandeja.me') || part.url.includes('localhost'))) {
                                          e.preventDefault();
                                          try {
                                            const urlObj = new URL(part.url);
                                            navigate(urlObj.pathname + urlObj.search + urlObj.hash);
                                          } catch {
                                            window.open(part.url, '_blank');
                                          }
                                        }
                                      }}
                                      className={`underline ${isChannel
                                          ? 'text-blue-600 dark:text-blue-400'
                                          : isOwnMessage
                                            ? 'text-blue-100'
                                            : 'text-blue-600 dark:text-blue-400'
                                        }`}
                                    >
                                      {part.displayText || part.content}
                                    </a>
                                  );
                                }
                                return <span key={index}>{part.content}</span>;
                              })
                            ) : (
                              displayContent
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Time and read status inside bubble */}
                    <div className={`absolute bottom-1 right-2 flex flex-nowrap items-center gap-1 ${isChannel ? 'text-gray-400 dark:text-gray-500' : (isOwnMessage ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500')}`}>
                      <span className="text-[10px] whitespace-nowrap shrink-0">
                        {formatMessageTime(currentMessage.createdAt)}
                        {currentMessage.editedAt && (
                          <Pencil size={10} className="inline opacity-80 ml-0.5" title={t('chat.edited', { defaultValue: 'edited' })} />
                        )}
                      </span>
                      {isOwnMessage && (
                        <div className="flex items-center relative">
                          {isSending ? (
                            <div className="flex items-center gap-0.5" title="Sending...">
                              <span className="w-1.5 h-1.5 bg-current rounded-full opacity-70 wavy-dot-1" />
                              <span className="w-1.5 h-1.5 bg-current rounded-full opacity-70 wavy-dot-2" />
                              <span className="w-1.5 h-1.5 bg-current rounded-full opacity-70 wavy-dot-3" />
                            </div>
                          ) : isFailed ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setShowFailedMenu((v) => !v); }}
                                className="p-0.5 rounded hover:bg-white/20"
                                title={t('chat.failedToSend', { defaultValue: 'Failed to send' })}
                              >
                                <AlertCircle size={14} className="text-red-200" />
                              </button>
                              {showFailedMenu && optimisticId && (onResendQueued || onRemoveFromQueue) && (
                                <div className="absolute right-0 bottom-full mb-1 flex flex-col gap-0.5 rounded-lg bg-gray-800 dark:bg-gray-700 py-1 shadow-lg z-50 min-w-[100px]">
                                  {onResendQueued && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setShowFailedMenu(false); onResendQueued(optimisticId); }} className="px-3 py-1.5 text-left text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600">
                                      {t('chat.resend', { defaultValue: 'Resend' })}
                                    </button>
                                  )}
                                  {onRemoveFromQueue && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setShowFailedMenu(false); onRemoveFromQueue(optimisticId); }} className="px-3 py-1.5 text-left text-sm text-red-300 hover:bg-gray-700 dark:hover:bg-gray-600">
                                      {t('chat.delete', { defaultValue: 'Delete' })}
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          ) : currentMessage.readReceipts && currentMessage.readReceipts.length > 0 ? (
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
                  {!isOffline && hasReplies() && (
                    <div className={`absolute top-[calc(100%-2px)] ${isOwnMessage ? 'right-1' : 'left-2'} z-10 overflow-visible`}>
                      <button
                        onClick={handleScrollToReplies}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] transition-colors ${isOwnMessage
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

                  {!isOffline && (
                    <div className={`flex items-center gap-1 ${isOwnMessage ? 'flex-row-reverse mr-1' : 'flex-row ml-1'} self-center`}>
                      <button
                        data-reaction-button="true"
                        onClick={handleQuickReaction}
                        disabled={isReactionPending()}
                        className="relative flex flex-col items-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full p-1 transition-colors disabled:opacity-70 disabled:cursor-wait"
                      >
                        {isReactionPending() ? (
                          <div className="flex flex-col items-center">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                              {getCurrentUserReaction() || '…'}
                            </span>
                          </div>
                        ) : (
                          <>
                            <span className="text-lg">
                              {getCurrentUserReaction() || (
                                <span className="text-gray-600 dark:text-white">♡</span>
                              )}
                            </span>
                            <span className={`text-xs text-gray-500 dark:text-gray-400 -mt-1 ${getCurrentUserReaction() && getReactionCounts()[getCurrentUserReaction()!] > 1 ? 'visible' : 'invisible'}`}>
                              {getCurrentUserReaction() ? getReactionCounts()[getCurrentUserReaction()!] || '1' : '1'}
                            </span>
                          </>
                        )}
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
                  )}
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
          onEdit={onEditMessage}
          onCopy={handleCopyMessage}
          onDelete={onDeleteMessage}
          onReactionSelect={onAddReaction}
          onReactionRemove={onRemoveReaction}
          onClose={onCloseContextMenu}
          messageElementRef={messageRef}
          onDeleteStart={handleDeleteStart}
          onReport={(msg) => setReportMessage(msg)}
          onTranslationUpdate={handleTranslationUpdate}
          isPinned={isPinned}
          onPin={onPin}
          onUnpin={onUnpin}
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
          isOpen={!!fullscreenImage}
        />
      )}
    </>
  );
};
