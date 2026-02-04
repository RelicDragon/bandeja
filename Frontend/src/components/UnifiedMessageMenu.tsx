import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChatMessage, chatApi } from '@/api/chat';
import { DoubleTickIcon } from './DoubleTickIcon';
import { formatDate } from '@/utils/dateFormat';
import { REACTION_EMOJIS, formatFullDateTime, getUserDisplayName, getUserInitials } from '@/utils/messageMenuUtils';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings, formatGameTime } from '@/utils/displayPreferences';
import { Flag, Languages } from 'lucide-react';

interface UnifiedMessageMenuProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  currentReaction?: string;
  onReply: (message: ChatMessage) => void;
  onCopy: (message: ChatMessage) => void;
  onDelete: (messageId: string) => void;
  onReactionSelect: (messageId: string, emoji: string) => void;
  onReactionRemove: (messageId: string) => void;
  onClose: () => void;
  messageElementRef: React.RefObject<HTMLDivElement | null>;
  onDeleteStart?: (messageId: string) => void;
  onReport?: (message: ChatMessage) => void;
  onTranslationUpdate?: (messageId: string, translation: { languageCode: string; translation: string }) => void;
}

export const UnifiedMessageMenu: React.FC<UnifiedMessageMenuProps> = ({
  message,
  isOwnMessage,
  currentReaction,
  onReply,
  onCopy,
  onDelete,
  onReactionSelect,
  onReactionRemove,
  onClose,
  messageElementRef,
  onDeleteStart,
  onReport,
  onTranslationUpdate,
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const displaySettings = user ? resolveDisplaySettings(user) : null;
  const menuRef = useRef<HTMLDivElement>(null);
  const mainMenuRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [menuHeight, setMenuHeight] = useState<number>(0);
  const [detailsHeight, setDetailsHeight] = useState<number>(0);
  const [isInitialRender, setIsInitialRender] = useState(true);
  const [isTranslating, setIsTranslating] = useState(false);
  const duplicateRef = useRef<HTMLDivElement>(null);
  const openTimeRef = useRef(0);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.pointerEvents = 'none';
    openTimeRef.current = Date.now();

    const shouldIgnore = () => Date.now() - openTimeRef.current < 400;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && !shouldIgnore()) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && !shouldIgnore()) {
        event.preventDefault();
        onClose();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && !shouldIgnore()) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    };
  }, [onClose]);

  // Measure heights for smooth transitions
  useEffect(() => {
    const measureHeights = () => {
      if (mainMenuRef.current) {
        const height = mainMenuRef.current.scrollHeight;
        if (height > 0) {
          setMenuHeight(height);
        }
      }
      if (detailsRef.current) {
        const height = detailsRef.current.scrollHeight + 10;
        if (height > 10) {
          setDetailsHeight(height);
        }
      }
    };

    // Measure heights after component mounts and when content changes
    measureHeights();
    
    // Re-measure when showDetails changes with multiple attempts to ensure proper measurement
    const timeoutId1 = setTimeout(() => {
      measureHeights();
      setIsInitialRender(false);
    }, 0);
    const timeoutId2 = setTimeout(measureHeights, 10);
    const timeoutId3 = setTimeout(measureHeights, 50);
    
    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
    };
  }, [showDetails, message.readReceipts, message.reactions, messageElementRef]);

  const handleReply = () => {
    onReply(message);
    onClose();
  };

  const handleCopy = () => {
    onCopy(message);
    onClose();
  };

  const handleTranslate = async () => {
    if (!message.content || !message.content.trim() || isTranslating) {
      return;
    }

    setIsTranslating(true);
    try {
      const translation = await chatApi.translateMessage(message.id);
      if (onTranslationUpdate) {
        onTranslationUpdate(message.id, translation);
      }
      onClose();
    } catch (error: any) {
      console.error('Failed to translate message:', error);
      // Always use frontend translations for user-facing error messages
      const errorMessage = error?.response?.status === 503 
        ? t('chat.translationUnavailable', { defaultValue: 'Translation is temporarily unavailable. Please try again later.' })
        : t('chat.translationError', { defaultValue: 'Failed to translate message. Please try again.' });
      toast.error(errorMessage);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleReport = () => {
    if (onReport) {
      onReport(message);
    }
    onClose();
  };

  const handleDelete = () => {
    // Trigger deletion animation
    if (onDeleteStart) {
      onDeleteStart(message.id);
    }
    
    // Close menu first
    onClose();
    
    // Delay the actual deletion to allow animation to play
    setTimeout(() => {
      onDelete(message.id);
    }, 300);
  };

  const handleReactionClick = (emoji: string) => {
    if (currentReaction === emoji) {
      onReactionRemove(message.id);
    } else {
      onReactionSelect(message.id, emoji);
    }
    onClose();
  };

  const handleShowDetails = () => {
    setShowDetails(true);
  };

  const handleBackToMenu = () => {
    setShowDetails(false);
  };

  const handleBackdropClick = () => {
    if (Date.now() - openTimeRef.current < 400) return;
    onClose();
  };

  const getReadReceiptsWithReactions = () => {
    const readReceipts = message.readReceipts || [];
    const reactions = message.reactions || [];
    
    return readReceipts.map((receipt, index) => {
      const userReaction = reactions.find(r => r.userId === receipt.userId);
      return {
        ...receipt,
        reaction: userReaction,
        key: receipt.id || `receipt-${index}`
      };
    }).sort((a, b) => new Date(a.readAt).getTime() - new Date(b.readAt).getTime());
  };

  const formatReadTime = (readAt: string) => {
    const readDate = new Date(readAt);
    const now = new Date();
    const diffInHours = (now.getTime() - readDate.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      const timePart = displaySettings ? formatGameTime(readAt, displaySettings) : formatDate(readDate, 'HH:mm');
      return `today at ${timePart}`;
    } else if (diffInHours < 48) {
      const timePart = displaySettings ? formatGameTime(readAt, displaySettings) : formatDate(readDate, 'HH:mm');
      return `yesterday at ${timePart}`;
    } else {
      return formatFullDateTime(readAt, user);
    }
  };

  // Calculate center position for menu - ensure it's centered and within bounds
  const effectiveMenuHeight = showDetails ? (detailsHeight || 200) : (menuHeight || 150);
  
  // Center the menu vertically on screen
  const menuCenterTop = (window.innerHeight - effectiveMenuHeight) / 2;
  
  // Position menu with bounds checking (min 20px from top, min 20px from bottom)
  const menuTop = Math.max(20, Math.min(menuCenterTop, window.innerHeight - effectiveMenuHeight - 20));
  
  // Position message: sticked to top of menu + gap (message bottom = menuTop - gap)
  const messageGap = 5;
  // Message top will be calculated dynamically based on its actual height
  // We'll position it so its bottom edge is at menuTop - gap

  // Create and mount duplicate message element
  useEffect(() => {
    if (!messageElementRef.current || !duplicateRef.current) return;
    
    const originalElement = messageElementRef.current;
    const duplicate = originalElement.cloneNode(true) as HTMLElement;
    
    // Calculate message position: bottom edge should be at menuTop - gap
    // We'll position from bottom to make this simpler
    const messageBottomPosition = menuTop - messageGap;
    
    // Get the actual width of the original message element
    const originalWidth = originalElement.offsetWidth || originalElement.getBoundingClientRect().width;
    
    // Style the duplicate for the overlay
    duplicate.style.position = 'fixed';
    duplicate.style.bottom = `${window.innerHeight - messageBottomPosition}px`;
    duplicate.style.left = '50%';
    duplicate.style.transform = 'translateX(0%) scale(0.5)';
    duplicate.style.zIndex = '9999';
    duplicate.style.width = `${originalWidth}px`;
    duplicate.style.maxWidth = 'none';
    // Constrain height only to prevent overlap with menu - let it overflow upward if needed
    duplicate.style.maxHeight = `${messageBottomPosition}px`;
    duplicate.style.overflow = 'hidden';
    duplicate.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    duplicate.style.opacity = '0';
    
    // Trigger the bounce animation after a brief delay
    setTimeout(() => {
      duplicate.style.transform = 'translateX(-50%) scale(1)';
      duplicate.style.opacity = '1';
    }, 10);
    
    // Find and truncate the message content
    const messageContent = duplicate.querySelector('p');
    if (messageContent) {
      messageContent.style.display = '-webkit-box';
      messageContent.style.webkitLineClamp = '8';
      messageContent.style.webkitBoxOrient = 'vertical';
      messageContent.style.overflow = 'hidden';
      messageContent.style.textOverflow = 'ellipsis';
    }
    
    // Clear existing content and append the duplicate
    const duplicateElement = duplicateRef.current;
    duplicateElement.innerHTML = '';
    duplicateElement.appendChild(duplicate);
    
    return () => {
      if (duplicateElement) {
        duplicateElement.innerHTML = '';
      }
    };
  }, [messageElementRef, menuTop, messageGap]);

  // Trigger bounce animation for the menu
  useEffect(() => {
    if (isInitialRender && menuRef.current) {
      const timeoutId = setTimeout(() => {
        if (menuRef.current) {
          menuRef.current.style.transform = 'translateX(-50%) scale(1)';
          menuRef.current.style.opacity = '1';
        }
      }, 10);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isInitialRender]);

  const content = (
    <>
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-md z-[9998] pointer-events-auto transition-opacity duration-150"
        style={{ opacity: isInitialRender ? 0 : 1 }}
        onClick={handleBackdropClick}
      />

      <div ref={duplicateRef} />

      {/* Context menu */}
      <div
        ref={menuRef}
        className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-[9999] min-w-[200px] max-w-[90vw] overflow-hidden pointer-events-auto"
        style={{
          left: '50%',
          top: `${menuTop}px`,
          transform: isInitialRender ? 'translateX(-50%) scale(0.8)' : 'translateX(-50%)',
          maxHeight: `${window.innerHeight - 40}px`,
          height: effectiveMenuHeight,
          paddingTop: '2px',
          paddingBottom: '5px',
          opacity: isInitialRender ? '0' : '1',
          transition: isInitialRender ? 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)' : 'all 0.15s ease-in-out',
        }}
      >
      <div className="relative flex">
        {/* Main Menu */}
        <div 
          ref={mainMenuRef}
          className={`w-full ${
            isInitialRender ? '' : 'transition-transform duration-150 ease-in-out'
          } ${showDetails ? '-translate-x-full' : 'translate-x-0'}`}
        >
          {/* Reactions Section */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-600">
            <div className="flex flex-wrap gap-1">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReactionClick(emoji)}
                  className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors ${
                    currentReaction === emoji ? 'bg-blue-50 dark:bg-blue-900' : ''
                  }`}
                  title={t('chat.reactions.reactWith', { emoji })}
                >
                  <span className="text-lg">{emoji}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Context Menu Actions */}
          <div className="py-1">
            
             <button
               onClick={handleShowDetails}
               className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
             >
               <div className="flex items-center space-x-3">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
                 <span>{t('chat.contextMenu.details')}</span>
               </div>
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
               </svg>
             </button>
            
            <button
              onClick={handleReply}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span>{t('chat.contextMenu.reply')}</span>
            </button>
            
            <button
              onClick={handleCopy}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>{t('chat.contextMenu.copy')}</span>
            </button>
            
            {message.content && message.content.trim() && (
              <button
                onClick={handleTranslate}
                disabled={isTranslating}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Languages className="w-4 h-4" />
                <span>{isTranslating ? t('chat.contextMenu.translating', { defaultValue: 'Translating...' }) : t('chat.contextMenu.translate', { defaultValue: 'Translate' })}</span>
              </button>
            )}
            
            {!isOwnMessage && onReport && (
              <button
                onClick={handleReport}
                className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-3"
              >
                <Flag className="w-4 h-4" />
                <span>{t('chat.contextMenu.report')}</span>
              </button>
            )}
            
            {isOwnMessage && (
              <button
                onClick={handleDelete}
                className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>{t('chat.contextMenu.delete')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Details View */}
        <div 
          ref={detailsRef}
          className={`absolute top-0 left-0 w-full ${
            isInitialRender ? '' : 'transition-transform duration-150 ease-in-out'
          } ${showDetails ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {/* Back Button */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-600">
            <button
              onClick={handleBackToMenu}
              className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium">{t('chat.contextMenu.back')}</span>
            </button>
          </div>

          {/* Message Details */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-600">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <div>{formatFullDateTime(message.createdAt, user)}</div>
              <div>{message.sender ? getUserDisplayName(message.sender) : 'Unknown User'}</div>
            </div>
          </div>

          {/* Read Receipts */}
          <div className="px-3 py-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              <div className="font-medium">{t('chat.contextMenu.readBy')} ({message.readReceipts?.length || 0})</div>
            </div>
            
            {message.readReceipts && message.readReceipts.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {getReadReceiptsWithReactions().map((receipt) => (
                  <div key={receipt.id} className="flex items-center space-x-2">
                    {/* Avatar */}
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                      {receipt.user?.firstName ? getUserInitials(receipt.user) : 'U'}
                    </div>
                    
                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                        {receipt.user && getUserDisplayName(receipt.user)}
                        {!receipt.user && 'Unknown User'}
                      </div>
                      <div className="flex items-center space-x-1">
                        <DoubleTickIcon size={14} variant="double" className="text-gray-500" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatReadTime(receipt.readAt)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Reaction */}
                    {receipt.reaction && (
                      <div className="text-sm">
                        {receipt.reaction.emoji}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                No read receipts yet
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
