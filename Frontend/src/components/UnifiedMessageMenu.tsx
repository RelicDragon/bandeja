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
import {
  formatFullDateTime,
  getUserDisplayName,
  hasUserDisplayName,
  mergeBasicUsers,
} from '@/utils/messageMenuUtils';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { EmojiQuickStrip, type ReactionEmojiPickSource } from '@/components/reactions/EmojiQuickStrip';
import {
  frequentReactionStripFromStore,
  isEventFromReactionEmojiPickerPortal,
} from '@/components/reactions/reactionPickerTypes';
import { useReactionEmojiUsageStore } from '@/store/reactionEmojiUsageStore';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings, formatGameTime } from '@/utils/displayPreferences';
import {
  getTranslationLanguageByCode,
  resolveIncomingTranslationTargetCode,
} from '@/utils/translationLanguages';
import { isCapacitor } from '@/utils/capacitor';
import { FileText, Flag, Forward, Languages, Pencil, Pin, PinOff, Star, Sticker } from 'lucide-react';
import { isVoiceTranscriptionNoSpeech } from '@/utils/voiceTranscriptionDisplay';
import { isForwardableMessage } from '@/services/chat/forwardMessage';
import { usePlayersStore } from '@/store/playersStore';
import { fetchBasicUsersBatched } from '@/services/users/fetchBasicUsersBatched';
import type { BasicUser } from '@/types';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useIsStickerFavorite } from '@/hooks/useIsStickerFavorite';
import { useMessageDetails } from './chat/useMessageDetails';
import { buildMessageDetailsAudienceRows } from '@/utils/messageDetailsAudience';
import {
  isEligibleSaveAsStickerMessage,
  saveChatImageAsSticker,
} from '@/utils/saveAsSticker';
import {
  CHAT_MESSAGE_MENU_BACKDROP,
  CHAT_MESSAGE_MENU_INNER,
  CHAT_MESSAGE_MENU_ROOT,
  CHAT_MESSAGE_MENU_SECTION,
  CHAT_MESSAGE_MENU_SHELL_ENTER,
  CHAT_MESSAGE_MENU_SHELL_ENTER_SCALE,
  CHAT_MESSAGE_MENU_SHELL_EXIT,
  CHAT_MESSAGE_MENU_SHELL_EXIT_SCALE,
  CHAT_MESSAGE_ROW_EXIT_MS,
  MESSAGE_MENU_PREVIEW_SPRING,
} from '@/components/chat/chatListMotion';
import {
  MessageMenuPreview,
  type MessageMenuPreviewExit,
} from '@/components/chat/MessageMenuPreview';
import {
  computeMessageMenuLayout,
  readSafeAreaInsets,
  resolveMessageMenuAnchorAlign,
  type MessageMenuAnchorAlign,
  type MessageMenuRect,
} from '@/utils/messageMenuLayout';

/** Gap between the lifted preview and the menu (also used to centre the fallback menu). */
const MENU_GAP_PX = 8;
/** Shell padding (2 + 5) + border (1 + 1) around the measured main-menu content. */
const MENU_SHELL_CHROME_PX = 9;
const MENU_FALLBACK_WIDTH_PX = 220;

const MENU_ORIGIN: Record<'left' | 'right' | 'center', string> = {
  left: 'top left',
  right: 'top right',
  center: 'top center',
};

interface MenuSource {
  element: HTMLElement;
  rect: MessageMenuRect;
  anchorRect: MessageMenuRect;
  anchorAlign: MessageMenuAnchorAlign;
}

interface MenuViewport {
  width: number;
  height: number;
  safeTop: number;
  safeBottom: number;
}

const toRect = (r: DOMRect): MessageMenuRect => ({
  top: r.top,
  left: r.left,
  width: r.width,
  height: r.height,
});

function captureMenuSource(element: HTMLElement | null): MenuSource | null {
  if (!element || !element.isConnected) return null;
  const rect = toRect(element.getBoundingClientRect());
  const bubble = element.querySelector<HTMLElement>('[data-message-bubble="true"]');
  const anchorRect = bubble ? toRect(bubble.getBoundingClientRect()) : rect;
  return { element, rect, anchorRect, anchorAlign: resolveMessageMenuAnchorAlign(rect, anchorRect) };
}

function readMenuViewport(): MenuViewport {
  const insets = readSafeAreaInsets();
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    safeTop: insets.top,
    safeBottom: insets.bottom,
  };
}

const sameViewport = (a: MenuViewport, b: MenuViewport) =>
  a.width === b.width && a.height === b.height && a.safeTop === b.safeTop && a.safeBottom === b.safeBottom;

interface UnifiedMessageMenuProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  currentReaction?: string;
  onReply?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onCopy: (message: ChatMessage) => void;
  onDelete?: (messageId: string) => void;
  onReactionSelect?: (messageId: string, emoji: string) => void;
  onReactionRemove?: (messageId: string) => void;
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
  const user = useAuthStore((s) => s.user);
  const isSystemMessage = !message.senderId;
  const displaySettings = user ? resolveDisplaySettings(user) : null;
  const preferredTranslationCode = resolveIncomingTranslationTargetCode(user);
  const preferredTranslationLabel =
    getTranslationLanguageByCode(preferredTranslationCode)?.label ?? preferredTranslationCode;
  const menuRef = useRef<HTMLDivElement>(null);
  const mainMenuRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const details = useMessageDetails(message.id, showDetails);
  // Hold the loading state until audience names are resolved, so rows don't pop in as "Unknown User".
  const [usersSettled, setUsersSettled] = useState(false);
  const detailsStatus = details.status === 'ready' && !usersSettled ? 'loading' : details.status;
  const detailsMessage = details.data?.message ?? message;
  const [menuHeight, setMenuHeight] = useState(0);
  const [detailsHeight, setDetailsHeight] = useState(0);
  const [menuWidth, setMenuWidth] = useState(0);
  const [menuPlaced, setMenuPlaced] = useState(false);
  const [source] = useState(() => captureMenuSource(messageElementRef.current));
  const [viewport, setViewport] = useState(readMenuViewport);
  const [previewNaturalHeight, setPreviewNaturalHeight] = useState(0);
  const [exit, setExit] = useState<MessageMenuPreviewExit | null>(null);
  const sourceVisibilityRef = useRef<string | null>(null);
  const closingRef = useRef(false);
  const deletingRef = useRef(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSavingSticker, setIsSavingSticker] = useState(false);
  const openTimeRef = useRef(0);
  const [visible, setVisible] = useState(true);
  const reduceMotion = usePrefersReducedMotion();
  const instantTransition = reduceMotion ? { duration: 0 } : undefined;
  const canReact = !!onReactionSelect && !!onReactionRemove;

  const restoreSourceVisibility = useCallback(() => {
    if (!source || sourceVisibilityRef.current === null) return;
    const { element } = source;
    const visibility = sourceVisibilityRef.current;
    sourceVisibilityRef.current = null;
    // A deleted row keeps playing its exit animation; revealing it early would flash it back.
    if (deletingRef.current) {
      window.setTimeout(() => {
        element.style.visibility = visibility;
      }, CHAT_MESSAGE_ROW_EXIT_MS);
      return;
    }
    element.style.visibility = visibility;
  }, [source]);

  // Runs after MessageMenuPreview's layout effects (children first), so the clone already exists.
  useLayoutEffect(() => {
    if (!source) return;
    sourceVisibilityRef.current = source.element.style.visibility;
    source.element.style.visibility = 'hidden';
    return restoreSourceVisibility;
  }, [source, restoreSourceVisibility]);

  /**
   * Phase 1 of closing: fix the preview's exit target (the original row's current position,
   * or fade in place), then `exit` flips `visible` next render so AnimatePresence exits with it.
   */
  const closeMenu = useCallback(
    (mode: 'return' | 'fade' = 'return') => {
      if (closingRef.current) return;
      closingRef.current = true;
      let top: number | null = null;
      if (mode === 'return' && source?.element.isConnected) {
        const rect = source.element.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) top = rect.top;
      }
      setShowDetails(false);
      setExit({ top });
    },
    [source]
  );

  useEffect(() => {
    if (exit) setVisible(false);
  }, [exit]);

  const handleExitComplete = useCallback(() => {
    restoreSourceVisibility();
    onClose();
  }, [onClose, restoreSourceVisibility]);

  const handlePreviewNaturalHeight = useCallback((height: number) => {
    setPreviewNaturalHeight((prev) => (Math.abs(prev - height) < 0.5 ? prev : height));
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readMenuViewport();
        setViewport((prev) => (sameViewport(prev, next) ? prev : next));
      });
    };
    const visualViewport = window.visualViewport;
    window.addEventListener('resize', update);
    visualViewport?.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  const detailsAudienceRows = useMemo(
    () =>
      buildMessageDetailsAudienceRows(
        detailsMessage.readReceipts,
        detailsMessage.reactions,
        detailsMessage.senderId,
        user?.id,
        details.data?.readers
      ),
    [detailsMessage.readReceipts, detailsMessage.reactions, detailsMessage.senderId, user?.id, details.data?.readers]
  );

  const receiptAndSenderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of detailsAudienceRows) {
      if (row.userId) ids.add(row.userId);
    }
    if (message.senderId) ids.add(message.senderId);
    return [...ids];
  }, [detailsAudienceRows, message.senderId]);

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
    window.getSelection()?.removeAllRanges();

    const preventSelectStart = (event: Event) => {
      event.preventDefault();
    };

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
    document.addEventListener('selectstart', preventSelectStart);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('selectstart', preventSelectStart);
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    };
  }, [closeMenu]);

  useLayoutEffect(() => {
    let nextMenuHeight = 0;
    let nextDetailsHeight = 0;

    if (mainMenuRef.current && mainMenuRef.current.scrollHeight > 0) {
      nextMenuHeight = mainMenuRef.current.scrollHeight + MENU_SHELL_CHROME_PX;
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
    const nextMenuWidth = menuRef.current?.offsetWidth ?? 0;
    if (nextMenuWidth > 0) {
      setMenuWidth((prev) => (prev === nextMenuWidth ? prev : nextMenuWidth));
    }
  }, [showDetails, detailsAudienceRows, detailsStatus, message.reactions, usersById, viewport]);

  const menuReady = menuHeight > 0;
  useEffect(() => {
    if (menuReady) setMenuPlaced(true);
  }, [menuReady]);

  const handleReply = () => {
    if (!onReply) return;
    onReply(message);
    closeMenu();
  };

  const handleCopy = () => {
    onCopy(message);
    closeMenu();
  };

  const canForward = !!onForward && isForwardableMessage(message);

  const handleForward = () => {
    if (!onForward || !canForward) return;
    onForward(message);
    closeMenu();
  };

  const canSaveAsSticker = !isSystemMessage && isEligibleSaveAsStickerMessage(message);

  const favoriteStickerId =
    !isSystemMessage && message.messageType === 'STICKER' ? message.stickerId : null;
  const { isFavorite: isStickerFavorite, toggle: toggleStickerFavorite, busy: favoriteBusy } =
    useIsStickerFavorite(favoriteStickerId);
  const canFavoriteSticker = !!favoriteStickerId;

  const handleToggleFavorite = () => {
    if (!canFavoriteSticker || favoriteBusy) return;
    closeMenu();
    void toggleStickerFavorite().then((nowFavorite) => {
      if (nowFavorite === null) return;
      toast.success(
        nowFavorite
          ? t('chat.contextMenu.addedToFavorites', { defaultValue: 'Added to favorites' })
          : t('chat.contextMenu.removedFromFavorites', {
              defaultValue: 'Removed from favorites',
            })
      );
    });
  };

  const handleSaveAsSticker = async () => {
    if (!canSaveAsSticker || isSavingSticker) return;
    setIsSavingSticker(true);
    try {
      const ok = await saveChatImageAsSticker(message, t);
      if (ok) closeMenu();
    } finally {
      setIsSavingSticker(false);
    }
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
    if (!onDelete) return;
    // Trigger deletion animation
    if (onDeleteStart) {
      onDeleteStart(message.id);
    }
    
    // Close menu first; the row is animating out, so the preview fades in place.
    deletingRef.current = true;
    closeMenu('fade');
    
    // Delay the actual deletion to allow animation to play
    setTimeout(() => {
      onDelete(message.id);
    }, CHAT_MESSAGE_ROW_EXIT_MS);
  };

  const handleReactionClick = (emoji: string, source: ReactionEmojiPickSource) => {
    if (!onReactionSelect || !onReactionRemove) {
      closeMenu();
      return;
    }
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
  };

  const resolveDetailsUser = useCallback(
    (userId: string, embedded?: BasicUser): BasicUser | undefined => {
      const fromStore = usersById[userId];
      if (userId === message.senderId) {
        return mergeBasicUsers(detailsMessage.sender ?? embedded, fromStore);
      }
      return mergeBasicUsers(embedded, fromStore);
    },
    [detailsMessage.sender, message.senderId, usersById]
  );

  useEffect(() => {
    if (!showDetails) {
      setUsersSettled(false);
      return;
    }
    if (details.status !== 'ready') return;
    let cancelled = false;

    const run = async () => {
      const missing: string[] = [];
      const seen = new Set<string>();

      const queueIfUnresolved = (userId: string | null | undefined, embedded?: BasicUser) => {
        if (!userId || seen.has(userId)) return;
        seen.add(userId);
        if (!hasUserDisplayName(resolveDetailsUser(userId, embedded))) {
          missing.push(userId);
        }
      };

      queueIfUnresolved(detailsMessage.senderId, detailsMessage.sender ?? undefined);
      for (const row of detailsAudienceRows) {
        queueIfUnresolved(row.userId, row.user);
      }

      if (missing.length === 0 || cancelled) {
        if (!cancelled) setUsersSettled(true);
        return;
      }

      try {
        await fetchBasicUsersBatched(message.id, missing);
        if (!cancelled) setUsersSettled(true);
      } catch (e: unknown) {
        const err = e as { response?: { status?: number; data?: unknown } };
        console.error('[UnifiedMessageMenu] basic users fetch failed', {
          messageId: message.id,
          status: err?.response?.status,
          body: err?.response?.data,
          error: e,
        });
        toast.error(t('common.error', { defaultValue: 'Something went wrong' }));
        if (!cancelled) setUsersSettled(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    showDetails,
    details.status,
    detailsMessage.senderId,
    detailsMessage.sender,
    message.id,
    message.senderId,
    message.sender,
    detailsAudienceRows,
    resolveDetailsUser,
    t,
  ]);

  const handleBackdropClick = () => {
    if (Date.now() - openTimeRef.current < 400) return;
    closeMenu();
  };

  const audienceDisplayUser = (row: { userId: string; user?: BasicUser }): BasicUser | undefined =>
    resolveDetailsUser(row.userId, row.user);

  const displaySenderUser = useMemo((): BasicUser | undefined => {
    if (!message.senderId) return undefined;
    return resolveDetailsUser(message.senderId, detailsMessage.sender ?? undefined);
  }, [detailsMessage.sender, message.senderId, resolveDetailsUser]);

  const formatAudienceTime = (iso: string) => {
    const readDate = new Date(iso);
    const now = new Date();
    const diffInHours = (now.getTime() - readDate.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      const timePart = displaySettings ? formatGameTime(iso, displaySettings) : formatDate(readDate, 'HH:mm');
      return `today at ${timePart}`;
    } else if (diffInHours < 48) {
      const timePart = displaySettings ? formatGameTime(iso, displaySettings) : formatDate(readDate, 'HH:mm');
      return `yesterday at ${timePart}`;
    } else {
      return formatFullDateTime(iso, user);
    }
  };

  const effectiveMenuHeight = showDetails ? (detailsHeight || menuHeight || 200) : (menuHeight || 200);

  const fallbackRect: MessageMenuRect = {
    top: (viewport.height - effectiveMenuHeight) / 2 - MENU_GAP_PX,
    left: viewport.width / 2,
    width: 0,
    height: 0,
  };
  const layout = computeMessageMenuLayout({
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    safeTop: viewport.safeTop,
    safeBottom: viewport.safeBottom,
    sourceRect: source?.rect ?? fallbackRect,
    anchorRect: source?.anchorRect ?? fallbackRect,
    anchorAlign: source?.anchorAlign ?? 'center',
    previewNaturalHeight: source ? previewNaturalHeight || source.rect.height : 0,
    menuHeight: effectiveMenuHeight,
    menuWidth: menuWidth || MENU_FALLBACK_WIDTH_PX,
    gap: MENU_GAP_PX,
  });

  // Snap into place on the first measured frame (menu still invisible); spring afterwards.
  const menuPositionTransition =
    reduceMotion || !menuPlaced ? { duration: 0 } : MESSAGE_MENU_PREVIEW_SPRING;
  const menuFadeTransition = reduceMotion ? { duration: 0 } : CHAT_MESSAGE_MENU_SHELL_ENTER;

  const content = (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {visible ? (
        <motion.div
          key="unified-message-menu"
          className="fixed inset-0 z-[9998] pointer-events-none select-none"
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={CHAT_MESSAGE_MENU_ROOT}
          transition={instantTransition}
        >
          <motion.div
            className="fixed inset-0 bg-black/30 backdrop-blur-md pointer-events-auto select-none"
            variants={CHAT_MESSAGE_MENU_BACKDROP}
            transition={instantTransition}
            onClick={handleBackdropClick}
          />

          {source ? (
            <MessageMenuPreview
              sourceElement={source.element}
              sourceRect={source.rect}
              top={layout.previewTop}
              height={layout.previewHeight}
              clipped={layout.previewClipped}
              exit={exit}
              reduceMotion={reduceMotion}
              onNaturalHeight={handlePreviewNaturalHeight}
              onExitComplete={restoreSourceVisibility}
            />
          ) : null}

          <motion.div
            ref={menuRef}
            className={`fixed top-0 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-2xl shadow-lg min-w-[200px] max-w-[90vw] overflow-x-hidden overflow-y-auto overscroll-contain pointer-events-auto select-none${reduceMotion ? '' : ' transition-[height] duration-300 ease-in-out'}`}
            initial={{
              opacity: 0,
              scale: CHAT_MESSAGE_MENU_SHELL_ENTER_SCALE,
              x: layout.menuLeft,
              y: layout.menuTop,
            }}
            animate={{
              opacity: menuReady ? 1 : 0,
              scale: menuReady ? 1 : CHAT_MESSAGE_MENU_SHELL_ENTER_SCALE,
              x: layout.menuLeft,
              y: layout.menuTop,
              transition: {
                x: menuPositionTransition,
                y: menuPositionTransition,
                opacity: menuFadeTransition,
                scale: menuFadeTransition,
              },
            }}
            exit={{
              opacity: 0,
              scale: CHAT_MESSAGE_MENU_SHELL_EXIT_SCALE,
              transition: reduceMotion ? { duration: 0 } : CHAT_MESSAGE_MENU_SHELL_EXIT,
            }}
            style={{
              transformOrigin: MENU_ORIGIN[layout.menuOriginX],
              maxHeight: layout.menuMaxHeight,
              height: menuReady ? effectiveMenuHeight : undefined,
              paddingTop: '2px',
              paddingBottom: '5px',
              zIndex: 9999,
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
                  {canReact && (
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
                  )}

                  <motion.div className="py-1" variants={CHAT_MESSAGE_MENU_SECTION} transition={instantTransition}>
             <button
               onClick={handleShowDetails}
               className="w-full px-4 py-2 text-start text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
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
            
            {showReply && onReply && (
              <button
                onClick={handleReply}
                className="w-full px-4 py-2 text-start text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                <span>{t('chat.contextMenu.reply')}</span>
              </button>
            )}
            {isOwnMessage && onEdit && !isSystemMessage && message.content != null && !message.poll && !message.forwardedFromMessageId && message.messageType !== 'VOICE' && message.messageType !== 'VIDEO' && message.messageType !== 'STICKER' && message.messageType !== 'DOCUMENT' && (
              <button
                onClick={() => { onEdit(message); closeMenu(); }}
                className="w-full px-4 py-2 text-start text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
              >
                <Pencil className="w-4 h-4" />
                <span>{t('chat.contextMenu.edit', { defaultValue: 'Edit' })}</span>
              </button>
            )}
            <button
              onClick={handleCopy}
              className="w-full px-4 py-2 text-start text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
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
                className="w-full px-4 py-2 text-start text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
              >
                <Forward className="w-4 h-4" />
                <span>{t('chat.contextMenu.forward', { defaultValue: 'Forward' })}</span>
              </button>
            )}
            {canSaveAsSticker && (
              <button
                type="button"
                onClick={() => void handleSaveAsSticker()}
                disabled={isSavingSticker}
                className="w-full px-4 py-2 text-start text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="chat-save-as-sticker"
              >
                <Sticker className="w-4 h-4" />
                <span>
                  {isSavingSticker
                    ? t('chat.contextMenu.savingAsSticker', { defaultValue: 'Saving…' })
                    : t('chat.contextMenu.saveAsSticker', { defaultValue: 'Save as sticker' })}
                </span>
              </button>
            )}
            {canFavoriteSticker && (
              <button
                type="button"
                onClick={handleToggleFavorite}
                disabled={favoriteBusy}
                className="w-full px-4 py-2 text-start text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="chat-toggle-sticker-favorite"
              >
                <Star className={`w-4 h-4 ${isStickerFavorite ? 'fill-current' : ''}`} />
                <span>
                  {isStickerFavorite
                    ? t('chat.contextMenu.removeFromFavorites', {
                        defaultValue: 'Remove from favorites',
                      })
                    : t('chat.contextMenu.addToFavorites', { defaultValue: 'Add to favorites' })}
                </span>
              </button>
            )}
            {onPin && !isPinned && !isSystemMessage && (
              <button
                onClick={() => { onPin(message); closeMenu(); }}
                className="w-full px-4 py-2 text-start text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
              >
                <Pin className="w-4 h-4" />
                <span>{t('chat.contextMenu.pin')}</span>
              </button>
            )}
            {onUnpin && isPinned && !isSystemMessage && (
              <button
                onClick={() => { onUnpin(message.id); closeMenu(); }}
                className="w-full px-4 py-2 text-start text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3"
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
                  className="w-full px-4 py-2 text-start text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="w-full px-4 py-2 text-start text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Languages className="w-4 h-4" />
                <span>
                  {isTranslating
                    ? t('chat.contextMenu.translating', { defaultValue: 'Translating...' })
                    : t('chat.contextMenu.translateTo', {
                        defaultValue: 'Translate to {{language}}',
                        language: preferredTranslationLabel,
                      })}
                </span>
              </button>
            )}
            
            {!isOwnMessage && onReport && !isSystemMessage && (
              <button
                onClick={handleReport}
                className="w-full px-4 py-2 text-start text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-3"
              >
                <Flag className="w-4 h-4" />
                <span>{t('chat.contextMenu.report')}</span>
              </button>
            )}
            
            {isOwnMessage && onDelete && !isSystemMessage && (
              <button
                onClick={handleDelete}
                className="w-full px-4 py-2 text-start text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-3"
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
              <div>{detailsMessage.editedAt ? `${t('chat.created', { defaultValue: 'Created' })}: ` : ''}{formatFullDateTime(detailsMessage.createdAt, user)}</div>
              {detailsMessage.editedAt && (
                <div>{t('chat.editedAt', { defaultValue: 'Edited' })}: {formatFullDateTime(detailsMessage.editedAt, user)}</div>
              )}
              <div className={`flex items-center min-h-[1.5rem] ${message.senderId ? 'gap-2' : ''}`}>
                {message.senderId ? (
                  <div className="shrink-0 w-6 h-6 flex items-center justify-center">
                    <PlayerAvatar
                      player={displaySenderUser ?? null}
                      inlineFace
                      asDiv
                      subscribePresence={false}
                      showName={false}
                      fullHideName
                    />
                  </div>
                ) : null}
                <div className={`min-w-0 text-gray-700 dark:text-gray-200 ${message.senderId ? 'flex-1' : ''}`}>
                  {displaySenderUser && hasUserDisplayName(displaySenderUser)
                    ? getUserDisplayName(displaySenderUser)
                    : 'Unknown User'}
                </div>
              </div>
            </div>
          </div>

          {/* Read Receipts */}
          <div className="px-3 py-2">
            {detailsStatus === 'ready' && detailsAudienceRows.length > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                <div className="font-medium">{t('chat.contextMenu.readBy')} ({detailsAudienceRows.length})</div>
              </div>
            )}
            {detailsStatus === 'loading' ? (
              <div role="status" className="text-xs text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
            ) : details.status === 'error' ? (
              <div role="alert" className="text-xs text-gray-500 dark:text-gray-400">
                <div>{t('common.error')}</div>
                <button className="mt-2 underline" onClick={details.retry}>{t('common.retry')}</button>
              </div>
            ) : detailsAudienceRows.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {detailsAudienceRows.map((row) => {
                  const du = audienceDisplayUser(row);
                  const statusTime = row.readAt ?? row.reaction?.createdAt;
                  return (
                    <div key={row.key} className="flex items-center gap-2">
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
                          {du && hasUserDisplayName(du) ? getUserDisplayName(du) : 'Unknown User'}
                        </div>
                        {row.isRead || statusTime ? (
                          <div className="flex items-center space-x-1">
                            {row.isRead ? (
                              <DoubleTickIcon size={14} variant="double" className="text-gray-500" />
                            ) : null}
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {row.readAt
                                ? formatAudienceTime(row.readAt)
                                : statusTime ? t('chat.contextMenu.reactedAt', {
                                    defaultValue: 'Reacted {{time}}',
                                    time: formatAudienceTime(statusTime),
                                  }) : null}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      {row.reaction ? <div className="text-sm">{row.reaction.emoji}</div> : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {detailsMessage.state === 'DELIVERED'
                  ? t('chat.contextMenu.deliveredNotReadYet', {
                      defaultValue: 'Delivered — not read yet',
                    })
                  : t('chat.contextMenu.notReadYet', { defaultValue: 'Not read yet' })}
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
