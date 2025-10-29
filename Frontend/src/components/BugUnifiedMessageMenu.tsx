import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BugMessage } from '@/api/bugChat';
import { DoubleTickIcon } from './DoubleTickIcon';
import { formatDate } from '@/utils/dateFormat';

interface BugUnifiedMessageMenuProps {
  message: BugMessage;
  isOwnMessage: boolean;
  currentReaction?: string;
  onReply: (message: BugMessage) => void;
  onCopy: (message: BugMessage) => void;
  onDelete: (messageId: string) => void;
  onReactionSelect: (messageId: string, emoji: string) => void;
  onReactionRemove: (messageId: string) => void;
  onClose: () => void;
  messageElementRef: React.RefObject<HTMLDivElement>;
  onDeleteStart?: (messageId: string) => void;
}

const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '😡', '🎉', '🔥'];

export const BugUnifiedMessageMenu: React.FC<BugUnifiedMessageMenuProps> = ({
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
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const mainMenuRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [menuHeight, setMenuHeight] = useState<number>(0);
  const [detailsHeight, setDetailsHeight] = useState<number>(0);
  const [messageHeight, setMessageHeight] = useState<number>(0);
  const [isInitialRender, setIsInitialRender] = useState(true);
  const duplicateRef = useRef<HTMLDivElement>(null);

  const formatFullDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return formatDate(date, 'MMM d, yyyy HH:mm:ss');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
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
      if (messageElementRef.current) {
        const height = messageElementRef.current.scrollHeight;
        if (height > 0) {
          setMessageHeight(height);
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
      return `today at ${formatDate(readDate, 'HH:mm')}`;
    } else if (diffInHours < 48) {
      return `yesterday at ${formatDate(readDate, 'HH:mm')}`;
    } else {
      return formatFullDateTime(readAt);
    }
  };

  const getUserDisplayName = (user: { firstName?: string; lastName?: string }) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    } else if (user.firstName) {
      return user.firstName;
    } else if (user.lastName) {
      return user.lastName;
    }
    return 'Unknown User';
  };

  const getUserInitials = (user: { firstName?: string; lastName?: string }) => {
    const first = user.firstName?.charAt(0) || '';
    const last = user.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || 'U';
  };

  // Calculate center position for both message and menu - only when we have proper measurements
  const effectiveMessageHeight = messageHeight || 100; // Fallback height
  const effectiveMenuHeight = showDetails ? (detailsHeight || 200) : (menuHeight || 150); // Fallback heights

  const totalHeight = effectiveMessageHeight + effectiveMenuHeight + 20; // 20px gap
  const centerTop = (window.innerHeight - totalHeight) / 2;
  const messageTop = Math.max(20, centerTop); // Ensure message is at least 20px from top
  const menuTop = messageTop + effectiveMessageHeight + 10; // 10px gap between message and menu

  // Create and mount duplicate message element
  useEffect(() => {
    if (!messageElementRef.current || !duplicateRef.current) return;

    const originalElement = messageElementRef.current;
    const duplicate = originalElement.cloneNode(true) as HTMLElement;

    // Style the duplicate for the overlay
    duplicate.style.position = 'fixed';
    duplicate.style.top = `${messageTop}px`;
    duplicate.style.left = '50%';
    duplicate.style.transform = 'translateX(-50%) scale(0.8)';
    duplicate.style.zIndex = '50';
    duplicate.style.maxWidth = '85%';
    duplicate.style.maxHeight = '60vh';
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
  }, [messageElementRef, messageTop]);

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

  return (
    <>
      {/* Blur backdrop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />

      {/* Duplicate message overlay */}
      <div ref={duplicateRef} />

      {/* Context menu */}
      <div
        ref={menuRef}
        className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 min-w-[200px] overflow-hidden"
        style={{
          left: '50%',
          top: `${menuTop}px`,
          transform: isInitialRender ? 'translateX(-50%) scale(0.8)' : 'translateX(-50%)',
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
              <div>{formatFullDateTime(message.createdAt)}</div>
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
};
