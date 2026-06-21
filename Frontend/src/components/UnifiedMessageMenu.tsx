import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Keyboard } from '@capacitor/keyboard';
import { ChatMessage, chatApi } from '@/api/chat';
import { DoubleTickIcon } from './DoubleTickIcon';
import { formatDate } from '@/utils/dateFormat';
import { computeMessageMenuTop, formatFullDateTime, getUserDisplayName } from '@/utils/messageMenuUtils';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { EmojiQuickStrip, type ReactionEmojiPickSource } from '@/components/reactions/EmojiQuickStrip';
import {
  frequentReactionStripFromStore,
  isEventFromReactionEmojiPickerPortal,
} from '@/components/reactions/reactionPickerTypes';
import { useReactionEmojiUsageStore } from '@/store/reactionEmojiUsageStore';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings, formatGameTime } from '@/utils/displayPreferences';
import { isCapacitor } from '@/utils/capacitor';
import { FileText, Flag, Forward, Languages, Loader2, Pencil, Pin, PinOff } from 'lucide-react';
import { formatChatMessageForForwardClipboard } from '@/utils/chatForwardClipboard';
import { isVoiceTranscriptionNoSpeech } from '@/utils/voiceTranscriptionDisplay';
import { usePlayersStore } from '@/store/playersStore';
import { fetchBasicUsersBatched } from '@/services/users/fetchBasicUsersBatched';
import type { BasicUser } from '@/types';
import { readReceiptsFromOthers } from '@/services/chat/messageTickState';
import {
  CHAT_MESSAGE_MENU_BACKDROP,
  CHAT_MESSAGE_MENU_INNER,
  CHAT_MESSAGE_MENU_ROOT,
  CHAT_MESSAGE_MENU_SECTION,
  CHAT_MESSAGE_MENU_SHELL,
  CHAT_MESSAGE_ROW_EXIT_MS,
} from '@/components/chat/chatListMotion';

function mergeBasicUsers(fromMessage: BasicUser | undefined, fromStore: BasicUser | undefined): BasicUser | undefined {
  if (fromMessage && fromStore) {
    return { ...fromStore, ...fromMessage, avatar: fromMessage.avatar ?? fromStore.avatar ?? null };
  }
  return fromMessage ?? fromStore;
}

interface UnifiedMessageMenuProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  currentReaction?: string;
  onReply: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onCopy: (message: ChatMessage) => void;
  onDelete: (messageId: string) => void;
  onReactionSelect: (messageId: string, emoji: string) => void;
  onReactionRemove: (messageId: string) => void;
  onClose: () => void;
  messageElementRef: React.RefObject<HTMLDivElement | null>;
  onDeleteStart?: (messageId: string) => void;
  onReport?: (message: ChatMessage) => void;
  onTranslationUpdate?: (messageId: string, translation: { languageCode: string; translation: string }) => void;
  onTranscribe?: () => Promise<boolean>;
  isTranscribing?: boolean;
  isPinned?: boolean;
  onPin?: (message: ChatMessage) => void;
  onUnpin?: (messageId: string) => void;
  showReply?: boolean;
  onForward?: (message: ChatMessage) => void;
}

export const UnifiedMessageMenu: React.FC<UnifiedMessageMenuProps> = ({
  message,
  isOwnMessage,
  currentReaction,
  onReply,
  onEdit,
  onCopy,
  onDelete,
  onReactionSelect,
  onReactionRemove,
  onClose,
  messageElementRef,
  onDeleteStart,
  onReport,
  onTranslationUpdate,
  onTranscribe,
  isTranscribing = false,
  isPinned = false,
  onPin,
  onUnpin,
  showReply = true,
  onForward,
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isSystemMessage = !message.senderId;
  const displaySettings = user ? resolveDisplaySettings(user) : null;
  const menuRef = useRef<HTMLDivElement>(null);
  const mainMenuRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [menuHeight, setMenuHeight] = useState(0);
  const [detailsHeight, setDetailsHeight] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [detailsUsersLoading, setDetailsUsersLoading] = useState(false);
  const duplicateRef = useRef<HTMLDivElement>(null);
  const duplicateElRef = useRef<HTMLElement | null>(null);
  const openTimeRef = useRef(0);
  const [visible, setVisible] = useState(true);
  const reduceMotion = usePrefersReducedMotion();
  const instantTransition = reduceMotion ? { duration: 0 } : undefined;

  const closeMenu = useCallback(() => {
    setShowDetails(false);
    setDetailsUsersLoading(false);
    setVisible(false);
  }, []);

  const otherReadReceipts = useMemo(
    () => readReceiptsFromOthers(message.readReceipts, message.senderId),
    [message.readReceipts, message.senderId]
  );

  const receiptAndSenderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of otherReadReceipts) {
      if (r.userId) ids.add(r.userId);
    }
    if (message.senderId) ids.add(message.senderId);
    return [...ids];
  }, [otherReadReceipts, message.senderId]);

  const usersById = usePlayersStore(
    useShallow((s) => {
      const o: Record<string, BasicUser | undefined> = {};
      for (const id of receiptAndSenderIds) {
        o[id] = s.users[id];
      }
      return o;
    })
  );

  useEffect(() => {
    if (isCapacitor()) {
      void Keyboard.hide();
    }
    document.body.style.overflow = 'hidden';
    document.body.style.pointerEvents = 'none';
    openTimeRef.current = Date.now();

    const shouldIgnore = () => Date.now() - openTimeRef.current < 400;

    const handleClickOutside = (event: MouseEvent) => {
      if (isEventFromReactionEmojiPickerPortal(event)) return;
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && !shouldIgnore()) {
        closeMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeMenu();
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (isEventFromReactionEmojiPickerPortal(event)) return;
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && !shouldIgnore()) {
        event.preventDefault();
        closeMenu();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (isEventFromReactionEmojiPickerPortal(event)) return;
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && !shouldIgnore()) {
        closeMenu();
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
  }, [closeMenu]);

  useLayoutEffect(() => {
    let nextMenuHeight = 0;
    let nextDetailsHeight = 0;

    if (mainMenuRef.current) {
      nextMenuHeight = mainMenuRef.current.scrollHeight;
    }
    if (detailsRef.current) {
      nextDetailsHeight = detailsRef.current.scrollHeight + 10;
    }

    if (nextMenuHeight > 0) {
      setMenuHeight((prev) => (prev === nextMenuHeight ? prev : nextMenuHeight));
    }
    if (nextDetailsHeight > 10) {
      setDetailsHeight((prev) => (prev === nextDetailsHeight ? prev : nextDetailsHeight));
    }
  }, [showDetails, message.readReceipts, message.reactions, detailsUsersLoading]);

  const handleReply = () => {
    onReply(message);
    closeMenu();
  };

  const handleCopy = () => {
    onCopy(message);
    closeMenu();
  };

  const forwardPayload = formatChatMessageForForwardClipboard(message);
  const canForward = !!onForward && !isSystemMessage && forwardPayload.length > 0;

  const handleForward = () => {
    if (!onForward || !canForward) return;
    onForward(message);
    closeMenu();
  };

  const translateSourceText = (): string => {
    const c = message.content?.trim() ?? '';
    if (c) return c;
    if (message.messageType === 'VOICE') {
      const tx = message.audioTranscription?.transcription?.trim() ?? '';
      if (!tx || isVoiceTranscriptionNoSpeech(tx)) return '';
      return tx;
    }
    return '';
  };

  const handleTranslate = async () => {
    const source = translateSourceText();
    if (!source || isTranslating) {
      return;
    }

    setIsTranslating(true);
    try {
      const translation = await chatApi.translateMessage(message.id);
      if (onTranslationUpdate) {
        onTranslationUpdate(message.id, translation);
      }
      closeMenu();
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

  const handleTranscribe = async () => {
    if (!onTranscribe || isTranscribing) return;
    const ok = await onTranscribe();
    if (ok) closeMenu();
  };

  const handleReport = () => {
    if (onReport) {
      onReport(message);
    }
    closeMenu();
  };

  const handleDelete = () => {
    // Trigger deletion animation
    if (onDeleteStart) {
      onDeleteStart(message.id);
    }
    
    // Close menu first
    closeMenu();
    
    // Delay the actual deletion to allow animation to play
    setTimeout(() => {
      onDelete(message.id);
    }, CHAT_MESSAGE_ROW_EXIT_MS);
  };

  const handleReactionClick = (emoji: string, source: ReactionEmojiPickSource) => {
    if (currentReaction === emoji) {
      if (source === 'catalog') {
        closeMenu();
        return;
      }
      onReactionRemove(message.id);
    } else {
      onReactionSelect(message.id, emoji);
    }
    closeMenu();
  };

  const frequentMenuEmojis = useReactionEmojiUsageStore(useShallow((s) => frequentReactionStripFromStore(s)));

  const handleShowDetails = () => {
    setShowDetails(true);
  };

  const handleBackToMenu = () => {
    setShowDetails(false);
    setDetailsUsersLoading(false);
  };

  useEffect(() => {
    if (!showDetails) return;
    let cancelled = false;

    const hasReceipts = (message.readReceipts?.length ?? 0) > 0;
    const needsSender = Boolean(message.senderId && !message.sender);

    if (!hasReceipts && !needsSender) {
      setDetailsUsersLoading(false);
      return;
    }

    setDetailsUsersLoading(true);

    const run = async () => {
      const idSet = new Set<string>();
      if (hasReceipts) {
        for (const r of message.readReceipts ?? []) {
          if (r.userId) idSet.add(r.userId);
        }
      }
      if (needsSender && message.senderId) idSet.add(message.senderId);

      const store = usePlayersStore.getState();
      const missing: string[] = [];
      for (const id of idSet) {
        const embedded =
          id === message.senderId ? message.sender : message.readReceipts?.find((r) => r.userId === id)?.user;
        if (embedded) continue;
        if (!store.getUser(id)) missing.push(id);
      }

      if (missing.length > 0) {
        try {
          await fetchBasicUsersBatched(message.id, missing);
        } catch (e: unknown) {
          const err = e as { response?: { status?: number; data?: unknown } };
          console.error('[UnifiedMessageMenu] basic users fetch failed', {
            messageId: message.id,
            status: err?.response?.status,
            body: err?.response?.data,
            error: e,
          });
          toast.error(t('common.error', { defaultValue: 'Something went wrong' }));
        }
      }

      if (!cancelled) setDetailsUsersLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [showDetails, message.id, message.senderId, message.readReceipts, message.sender, t]);

  const handleBackdropClick = () => {
    if (Date.now() - openTimeRef.current < 400) return;
    closeMenu();
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

  const displaySenderUser = useMemo((): BasicUser | undefined => {
    const fromStore = message.senderId ? usersById[message.senderId] : undefined;
    return mergeBasicUsers(message.sender ?? undefined, fromStore);
  }, [message.sender, message.senderId, usersById]);

  const receiptDisplayUser = (receipt: { userId: string; user?: BasicUser }): BasicUser | undefined =>
    mergeBasicUsers(receipt.user, usersById[receipt.userId]);

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

  const effectiveMenuHeight = showDetails ? (detailsHeight || menuHeight || 200) : (menuHeight || 200);
  const messageGap = 5;
  const menuTop = computeMessageMenuTop(window.innerHeight, effectiveMenuHeight);
  const messageBottomPosition = menuTop - messageGap;

  useLayoutEffect(() => {
    const originalElement = messageElementRef.current;
    const duplicateHost = duplicateRef.current;
    if (!originalElement || !duplicateHost) return;

    const duplicate = originalElement.cloneNode(true) as HTMLElement;
    const originalWidth = originalElement.offsetWidth || originalElement.getBoundingClientRect().width;

    duplicate.style.position = 'fixed';
    duplicate.style.left = '50%';
    duplicate.style.transform = 'translateX(-50%) scale(1)';
    duplicate.style.zIndex = '9999';
    duplicate.style.width = `${originalWidth}px`;
    duplicate.style.maxWidth = 'none';
    duplicate.style.overflow = 'hidden';
    duplicate.style.opacity = '1';
    duplicate.style.pointerEvents = 'none';

    const messageContent = duplicate.querySelector('p');
    if (messageContent) {
      messageContent.style.display = '-webkit-box';
      messageContent.style.webkitLineClamp = '8';
      messageContent.style.webkitBoxOrient = 'vertical';
      messageContent.style.overflow = 'hidden';
      messageContent.style.textOverflow = 'ellipsis';
    }

    duplicateHost.innerHTML = '';
    duplicateHost.appendChild(duplicate);
    duplicateElRef.current = duplicate;

    return () => {
      duplicateElRef.current = null;
      duplicateHost.innerHTML = '';
    };
  }, [messageElementRef]);

  useLayoutEffect(() => {
    const duplicate = duplicateElRef.current;
    if (!duplicate) return;
    duplicate.style.bottom = `${window.innerHeight - messageBottomPosition}px`;
    duplicate.style.maxHeight = `${messageBottomPosition}px`;
  }, [messageBottomPosition]);

  const content = (
    <AnimatePresence onExitComplete={onClose}>
      {visible ? (
        <motion.div
          key="unified-message-menu"
          className="fixed inset-0 z-[9998] pointer-events-none"
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={CHAT_MESSAGE_MENU_ROOT}
          transition={instantTransition}
        >
          <motion.div
            className="fixed inset-0 bg-black/30 backdrop-blur-md pointer-events-auto"
            variants={CHAT_MESSAGE_MENU_BACKDROP}
            transition={instantTransition}
            onClick={handleBackdropClick}
          />

          <div ref={duplicateRef} className="pointer-events-none" style={{ zIndex: 9999 }} />

          <motion.div
            ref={menuRef}
            className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-2xl shadow-lg min-w-[200px] max-w-[90vw] overflow-hidden pointer-events-auto"
            variants={CHAT_MESSAGE_MENU_SHELL}
            transition={instantTransition}
            style={{
              left: '50%',
              x: '-50%',
              top: `${menuTop}px`,
              maxHeight: `${window.innerHeight - 40}px`,
              height: menuHeight > 0 ? effectiveMenuHeight : undefined,
              paddingTop: '2px',
              paddingBottom: '5px',
              zIndex: 9999,
              transition: showDetails && !reduceMotion ? 'height 0.15s ease-in-out' : undefined,
            }}
          >
            <div className="relative flex">
              <div
                ref={mainMenuRef}
                className={`w-full transition-transform duration-150 ease-in-out ${showDetails ? '-translate-x-full' : 'translate-x-0'}`}
              >
                <motion.div
                  variants={CHAT_MESSAGE_MENU_INNER}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={instantTransition}
                >
                  <motion.div
                    className="px-3 py-2 border-b border-gray-200 dark:border-gray-600"
                    variants={CHAT_MESSAGE_MENU_SECTION}
                    transition={instantTransition}
                  >
                    <EmojiQuickStrip
                      frequentEmojis={frequentMenuEmojis}
                      currentEmoji={currentReaction}
                      onPick={(emoji, source) => handleReactionClick(emoji, source)}
                    />
                  </motion.div>

                  <motion.div className="py-1" variants={CHAT_MESSAGE_MENU_SECTION} transition={instantTransition}>
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
            
            {showReply && (
              <button
                onClick={handleReply}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                <span>{t('chat.contextMenu.reply')}</span>
              </button>
            )}
            {isOwnMessage && onEdit && !isSystemMessage && message.content != null && !message.poll && message.messageType !== 'VOICE' && message.messageType !== 'VIDEO' && (
              <button
                onClick={() => { onEdit(message); closeMenu(); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
              >
                <Pencil className="w-4 h-4" />
                <span>{t('chat.contextMenu.edit', { defaultValue: 'Edit' })}</span>
              </button>
            )}
            <button
              onClick={handleCopy}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>{t('chat.contextMenu.copy')}</span>
            </button>
            {canForward && (
              <button
                type="button"
                onClick={handleForward}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
              >
                <Forward className="w-4 h-4" />
                <span>{t('chat.contextMenu.forward', { defaultValue: 'Forward' })}</span>
              </button>
            )}
            {onPin && !isPinned && !isSystemMessage && (
              <button
                onClick={() => { onPin(message); closeMenu(); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
              >
                <Pin className="w-4 h-4" />
                <span>{t('chat.contextMenu.pin')}</span>
              </button>
            )}
            {onUnpin && isPinned && !isSystemMessage && (
              <button
                onClick={() => { onUnpin(message.id); closeMenu(); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
              >
                <PinOff className="w-4 h-4" />
                <span>{t('chat.contextMenu.unpin')}</span>
              </button>
            )}
            {message.messageType === 'VOICE' &&
              message.mediaUrls?.[0] &&
              !message.audioTranscription?.transcription?.trim() &&
              !isSystemMessage &&
              onTranscribe && (
                <button
                  onClick={() => void handleTranscribe()}
                  disabled={isTranscribing}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText className="w-4 h-4" />
                  <span>
                    {isTranscribing
                      ? t('chat.contextMenu.transcribingVoice', { defaultValue: 'Transcribing…' })
                      : t('chat.contextMenu.transcribe', { defaultValue: 'Transcribe' })}
                  </span>
                </button>
              )}
            {translateSourceText() && !isSystemMessage && (
              <button
                onClick={handleTranslate}
                disabled={isTranslating}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Languages className="w-4 h-4" />
                <span>{isTranslating ? t('chat.contextMenu.translating', { defaultValue: 'Translating...' }) : t('chat.contextMenu.translate', { defaultValue: 'Translate' })}</span>
              </button>
            )}
            
            {!isOwnMessage && onReport && !isSystemMessage && (
              <button
                onClick={handleReport}
                className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-3"
              >
                <Flag className="w-4 h-4" />
                <span>{t('chat.contextMenu.report')}</span>
              </button>
            )}
            
            {isOwnMessage && !isSystemMessage && (
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
                  </motion.div>
                </motion.div>
              </div>

              <div
                ref={detailsRef}
                className={`absolute top-0 left-0 w-full transition-transform duration-150 ease-in-out ${showDetails ? 'translate-x-0' : 'translate-x-full'}`}
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
              <div>{message.editedAt ? `${t('chat.created', { defaultValue: 'Created' })}: ` : ''}{formatFullDateTime(message.createdAt, user)}</div>
              {message.editedAt && (
                <div>{t('chat.editedAt', { defaultValue: 'Edited' })}: {formatFullDateTime(message.editedAt, user)}</div>
              )}
              <div className={`flex items-center min-h-[1.5rem] ${message.senderId ? 'gap-2' : ''}`}>
                {message.senderId ? (
                  <div className="shrink-0 w-6 h-6 flex items-center justify-center">
                    {displaySenderUser ? (
                      <PlayerAvatar
                        player={displaySenderUser}
                        inlineFace
                        asDiv
                        subscribePresence={false}
                        showName={false}
                        fullHideName
                      />
                    ) : detailsUsersLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" aria-hidden />
                    ) : null}
                  </div>
                ) : null}
                <div className={`min-w-0 text-gray-700 dark:text-gray-200 ${message.senderId ? 'flex-1' : ''}`}>
                  {displaySenderUser ? (
                    getUserDisplayName(displaySenderUser)
                  ) : detailsUsersLoading && message.senderId ? (
                    <span className="text-gray-400">…</span>
                  ) : (
                    'Unknown User'
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Read Receipts */}
          <div className="px-3 py-2">
            {(message.readReceipts?.length ?? 0) > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                <div className="font-medium">{t('chat.contextMenu.readBy')} ({message.readReceipts.length})</div>
              </div>
            )}
            {message.readReceipts && message.readReceipts.length > 0 ? (
              detailsUsersLoading ? (
                <div className="flex justify-center py-8 max-h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-hidden />
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {getReadReceiptsWithReactions().map((receipt) => {
                    const du = receiptDisplayUser(receipt);
                    return (
                      <div key={receipt.key} className="flex items-center gap-2">
                        <PlayerAvatar
                          player={du ?? null}
                          inlineFace
                          asDiv
                          subscribePresence={false}
                          showName={false}
                          fullHideName
                        />

                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                            {du ? getUserDisplayName(du) : 'Unknown User'}
                          </div>
                          <div className="flex items-center space-x-1">
                            <DoubleTickIcon size={14} variant="double" className="text-gray-500" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatReadTime(receipt.readAt)}
                            </span>
                          </div>
                        </div>

                        {receipt.reaction && <div className="text-sm">{receipt.reaction.emoji}</div>}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('chat.contextMenu.notReadYet', { defaultValue: 'Not read yet' })}
              </div>
            )}
          </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
