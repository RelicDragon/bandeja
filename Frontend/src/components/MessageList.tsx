import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useState,
  useReducer,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChatMessage, Poll } from '@/api/chat';
import { AnimatedMessageItem } from './AnimatedMessageItem';
import { useContextMenuManager } from '@/hooks/useContextMenuManager';
import {
  flushThreadScrollSave,
  getThreadScrollState,
  scheduleThreadScrollSave,
} from '@/services/chat/chatThreadScroll';
import {
  getCachedMessageRowHeight,
  preloadMessageRowHeights,
  rememberMeasuredMessageHeight,
} from '@/services/chat/chatMessageHeights';

const END_SPACER_PX = 128;
const ROW_ESTIMATE_PX = 88;
const VIRTUAL_OVERSCAN_BASE = 10;
const VIRTUAL_OVERSCAN_FAST = 22;

export type MessageListHandle = {
  scrollToMessageById: (messageId: string) => void;
  scrollToBottomAlign: () => void;
};

interface MessageListProps {
  messages: ChatMessage[];
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage) => void;
  onPollUpdated?: (messageId: string, updatedPoll: Poll) => void;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  isLoading?: boolean;
  isLoadingMessages?: boolean;
  isSwitchingChatType?: boolean;
  onScrollToMessage?: (messageId: string) => void;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
  isInitialLoad?: boolean;
  isLoadingMore?: boolean;
  isChannel?: boolean;
  userChatUser1Id?: string;
  userChatUser2Id?: string;
  onChatRequestRespond?: (messageId: string, accepted: boolean) => void;
  hasContextPanel?: boolean;
  pinnedMessageIds?: string[];
  onPin?: (message: ChatMessage) => void;
  onUnpin?: (messageId: string) => void;
  showReply?: boolean;
  onForwardMessage?: (message: ChatMessage) => void;
  threadScrollKey?: string | null;
  /** While true, keep bottom aligned as row heights / total size settle (Dexie preload, virtualizer measure). */
  threadLayoutSettling?: boolean;
}

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(function MessageList(
  {
    messages,
    onAddReaction,
    onRemoveReaction,
    onDeleteMessage,
    onReplyMessage,
    onEditMessage,
    onPollUpdated,
    onResendQueued,
    onRemoveFromQueue,
    isLoading = false,
    isLoadingMessages = false,
    isSwitchingChatType = false,
    onScrollToMessage,
    hasMoreMessages = false,
    onLoadMore,
    isInitialLoad = false,
    isLoadingMore = false,
    isChannel = false,
    userChatUser1Id,
    userChatUser2Id,
    onChatRequestRespond,
    hasContextPanel = false,
    pinnedMessageIds = [],
    onPin,
    onUnpin,
    showReply = true,
    onForwardMessage,
    threadScrollKey = null,
    threadLayoutSettling = false,
  },
  ref
) {
  const { t } = useTranslation();
  const pinnedSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const innerListRef = useRef<HTMLDivElement>(null);
  const topLoadSentinelRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const previousScrollHeightRef = useRef(0);
  const previousScrollTopRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const justLoadedOlderMessagesRef = useRef(false);
  const loadMoreCooldownRef = useRef(0);
  const { contextMenuState, openContextMenu, closeContextMenu, handleScrollStart } = useContextMenuManager();

  const rowCount = messages.length + 1;
  const [virtualOverscan, setVirtualOverscan] = useState(VIRTUAL_OVERSCAN_BASE);
  const scrollVelRef = useRef({ top: 0, t: 0 });
  const [, bumpHeightEstimates] = useReducer((n: number) => n + 1, 0);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: (index) => {
      if (index === rowCount - 1) return END_SPACER_PX;
      const id = messages[index]?.id;
      return getCachedMessageRowHeight(id) ?? ROW_ESTIMATE_PX;
    },
    overscan: virtualOverscan,
    getItemKey: (index) => (index === rowCount - 1 ? '__end__' : messages[index]?.id ?? `i-${index}`),
  });

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const messagesForScrollRef = useRef(messages);
  messagesForScrollRef.current = messages;

  const scrollToBottomAlign = useCallback(() => {
    const v = virtualizerRef.current;
    const len = messagesForScrollRef.current.length;
    const idx = len === 0 ? 0 : len;
    v.scrollToIndex(idx, { align: 'end', behavior: 'auto' });
  }, []);

  const messagesMeasureRef = useRef(messages);
  messagesMeasureRef.current = messages;

  const virtualItemsSnapshot = virtualizer.getVirtualItems();
  const virtualMeasureKey = virtualItemsSnapshot
    .filter((vi) => vi.index < rowCount - 1)
    .map((vi) => `${vi.index}:${messages[vi.index]?.id ?? ''}:${Math.round(vi.size)}`)
    .join('|');

  const tailIdsForHeightPreload = messages.slice(-140).map((m) => m.id).join('\x1e');

  useEffect(() => {
    let alive = true;
    const ids = tailIdsForHeightPreload.length === 0 ? [] : tailIdsForHeightPreload.split('\x1e');
    void preloadMessageRowHeights(ids).then(() => {
      if (alive) bumpHeightEstimates();
    });
    return () => {
      alive = false;
    };
  }, [threadScrollKey, tailIdsForHeightPreload]);

  useLayoutEffect(() => {
    const items = virtualizerRef.current.getVirtualItems();
    const msgs = messagesMeasureRef.current;
    for (const vi of items) {
      if (vi.index === rowCount - 1) continue;
      const m = msgs[vi.index];
      if (m?.id && vi.size > 2) rememberMeasuredMessageHeight(m.id, vi.size);
    }
  }, [virtualMeasureKey, rowCount]);

  const overscanRafRef = useRef<number | null>(null);

  const prevThreadScrollKeyRef = useRef<string | null | undefined>(undefined);
  const restoredScrollThreadRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (prevThreadScrollKeyRef.current !== threadScrollKey) {
      prevThreadScrollKeyRef.current = threadScrollKey;
      restoredScrollThreadRef.current = null;
    }
    if (!threadScrollKey) return;
    if (isSwitchingChatType || messages.length === 0) return;
    if (!messagesContainerRef.current) return;
    if (restoredScrollThreadRef.current === threadScrollKey) return;

    const snapshot = messages;
    let cancelled = false;

    const markRestored = () => {
      if (!cancelled) restoredScrollThreadRef.current = threadScrollKey;
    };

    void getThreadScrollState(threadScrollKey)
      .then((st) => {
        if (cancelled) return;
        const el = messagesContainerRef.current;
        if (!el) {
          markRestored();
          return;
        }
        if (!st) {
          markRestored();
          return;
        }
        if (st.atBottom) {
          const len = snapshot.length;
          virtualizerRef.current.scrollToIndex(len === 0 ? 0 : len, { align: 'end', behavior: 'auto' });
          markRestored();
          return;
        }
        if (st.anchorMessageId) {
          const idx = snapshot.findIndex((m) => m.id === st.anchorMessageId);
          if (idx < 0) {
            markRestored();
            return;
          }
          const runScroll = () => {
            if (cancelled) return;
            virtualizerRef.current.scrollToIndex(idx, { align: 'start', behavior: 'auto' });
          };
          runScroll();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              runScroll();
              markRestored();
            });
          });
          return;
        }
        markRestored();
      })
      .catch(() => {
        markRestored();
      });

    return () => {
      cancelled = true;
    };
  }, [threadScrollKey, isSwitchingChatType, messages]);

  useLayoutEffect(() => {
    if (!threadLayoutSettling || messages.length === 0) return;
    const inner = innerListRef.current;
    const run = () => {
      const len = messagesForScrollRef.current.length;
      if (len === 0) return;
      virtualizerRef.current.scrollToIndex(len, { align: 'end', behavior: 'auto' });
    };
    run();
    if (!inner) return;
    const ro = new ResizeObserver(() => {
      run();
    });
    ro.observe(inner);
    const tid = window.setTimeout(() => ro.disconnect(), 800);
    return () => {
      window.clearTimeout(tid);
      ro.disconnect();
    };
  }, [threadLayoutSettling, messages.length, threadScrollKey]);

  useEffect(() => {
    if (!threadScrollKey) return;
    if (isSwitchingChatType || messages.length === 0) return;

    const tick = () => {
      const el = messagesContainerRef.current;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      const items = virtualizerRef.current.getVirtualItems();
      let anchorMessageId: string | null = null;
      for (const vi of items) {
        if (vi.index >= messagesForScrollRef.current.length) continue;
        const m = messagesForScrollRef.current[vi.index];
        if (m) {
          anchorMessageId = m.id;
          break;
        }
      }
      scheduleThreadScrollSave(threadScrollKey, {
        atBottom: nearBottom,
        anchorMessageId: nearBottom ? null : anchorMessageId,
      });
    };

    const el = messagesContainerRef.current;
    if (!el) return;
    const onScrollVel = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const top = el.scrollTop;
      const prev = scrollVelRef.current;
      const dt = Math.max(now - prev.t, 1);
      const pxPerMs = Math.abs(top - prev.top) / dt;
      scrollVelRef.current = { top, t: now };
      const wantFast = pxPerMs > 0.35;
      if (overscanRafRef.current != null) cancelAnimationFrame(overscanRafRef.current);
      overscanRafRef.current = requestAnimationFrame(() => {
        overscanRafRef.current = null;
        setVirtualOverscan((cur) => {
          const next = wantFast ? VIRTUAL_OVERSCAN_FAST : VIRTUAL_OVERSCAN_BASE;
          return cur === next ? cur : next;
        });
      });
    };
    el.addEventListener('scroll', tick, { passive: true });
    el.addEventListener('scroll', onScrollVel, { passive: true });
    tick();
    return () => {
      el.removeEventListener('scroll', tick);
      el.removeEventListener('scroll', onScrollVel);
      if (overscanRafRef.current != null) cancelAnimationFrame(overscanRafRef.current);
      flushThreadScrollSave(threadScrollKey);
    };
  }, [threadScrollKey, isSwitchingChatType, messages.length]);

  const scrollToMessageById = useCallback(
    (messageId: string) => {
      const idx = messages.findIndex(
        (m) =>
          m.id === messageId ||
          (m as { _optimisticId?: string })._optimisticId === messageId
      );
      if (idx < 0) {
        const el = messagesContainerRef.current?.querySelector(`#message-${messageId}`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
    },
    [messages, virtualizer]
  );

  useImperativeHandle(
    ref,
    () => ({ scrollToMessageById, scrollToBottomAlign }),
    [scrollToMessageById, scrollToBottomAlign]
  );

  useEffect(() => {
    const wasLoading = isLoadingMoreRef.current;
    isLoadingMoreRef.current = isLoadingMore;

    const container = messagesContainerRef.current;
    if (!container) return;

    if (isLoadingMore) {
      previousScrollHeightRef.current = container.scrollHeight;
      previousScrollTopRef.current = container.scrollTop;
      justLoadedOlderMessagesRef.current = false;
    } else if (wasLoading) {
      justLoadedOlderMessagesRef.current = true;
      setTimeout(() => {
        justLoadedOlderMessagesRef.current = false;
      }, 500);
    }
  }, [isLoadingMore]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const currentMessageCount = messages.length;
    const previousMessageCount = previousMessageCountRef.current;
    const isNewMessagesAdded = currentMessageCount > previousMessageCount;

    if (isNewMessagesAdded) {
      const wasLoadingMore = isLoadingMoreRef.current || isLoadingMore;
      const justLoadedOlder = justLoadedOlderMessagesRef.current;

      if (wasLoadingMore || justLoadedOlder) {
        const previousScrollHeight = previousScrollHeightRef.current;
        const previousScrollTop = previousScrollTopRef.current;

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const c = messagesContainerRef.current;
            if (c) {
              const currentScrollHeight = c.scrollHeight;
              const scrollDifference = currentScrollHeight - previousScrollHeight;
              c.scrollTop = previousScrollTop + scrollDifference;
            }
          });
        });
      } else if (!threadLayoutSettling) {
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        if (isAtBottom && messages.length > 0) {
          virtualizerRef.current.scrollToIndex(messages.length, { align: 'end', behavior: 'smooth' });
        }
      }
    }

    previousMessageCountRef.current = currentMessageCount;
    if (!isLoadingMore) {
      requestAnimationFrame(() => {
        const c = messagesContainerRef.current;
        if (c) {
          previousScrollHeightRef.current = c.scrollHeight;
        }
      });
    }
  }, [messages, isLoadingMore, threadLayoutSettling]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      handleScrollStart();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScrollStart]);

  const loadMoreBlockedRef = useRef(false);
  loadMoreBlockedRef.current = isLoading || isLoadingMore;

  useEffect(() => {
    const root = messagesContainerRef.current;
    const target = topLoadSentinelRef.current;
    if (!root || !target || !onLoadMore || !hasMoreMessages || (isInitialLoad && messages.length === 0))
      return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (loadMoreBlockedRef.current) return;
        const now = Date.now();
        if (now - loadMoreCooldownRef.current < 400) return;
        loadMoreCooldownRef.current = now;
        onLoadMore();
      },
      { root, rootMargin: '160px 0px 0px 0px', threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [onLoadMore, hasMoreMessages, isInitialLoad, isSwitchingChatType, messages.length]);

  if (messages.length === 0 && (isSwitchingChatType || isLoadingMessages || isInitialLoad)) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-4 space-y-1 min-h-0" />
    );
  }

  if (messages.length === 0 && !isLoadingMessages && !isInitialLoad) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('chat.messages.noMessages')}</h3>
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={messagesContainerRef}
      className="relative flex-1 overflow-y-auto overflow-x-hidden scrollbar-auto bg-gray-50 dark:bg-gray-800 p-4 min-h-0 overscroll-contain"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {isSwitchingChatType && messages.length > 0 ? (
        <div
          className="pointer-events-none absolute top-0 left-4 right-4 z-[2] h-1 rounded-full bg-primary-400/35 dark:bg-primary-500/25 animate-pulse"
          aria-hidden
        />
      ) : null}
      {hasContextPanel && <div className="pt-6 flex-shrink-0" />}
      <div
        ref={topLoadSentinelRef}
        className="w-full shrink-0 flex flex-col items-center justify-center min-h-[8px] py-2 pointer-events-none gap-2"
        aria-hidden
      >
        {isLoadingMore && hasMoreMessages ? (
          <div
            className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-gray-600 dark:border-t-blue-400 animate-spin"
            role="status"
          />
        ) : null}
      </div>
      <div
        ref={innerListRef}
        className="space-y-1 relative w-full"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualItems.map((row) => {
          if (row.index === rowCount - 1) {
            return (
              <div
                key={row.key}
                data-index={row.index}
                ref={virtualizer.measureElement}
                className="left-0 top-0 w-full"
                style={{
                  position: 'absolute',
                  transform: `translateY(${row.start}px)`,
                }}
                aria-hidden
              >
                <div className="h-32" />
              </div>
            );
          }
          const message = messages[row.index]!;
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              id={`message-${message.id}`}
              className="left-0 top-0 w-full"
              style={{
                position: 'absolute',
                transform: `translateY(${row.start}px)`,
              }}
            >
              <AnimatedMessageItem
                message={message}
                staggerKey={message.id}
                onAddReaction={onAddReaction}
                onRemoveReaction={onRemoveReaction}
                onDeleteMessage={onDeleteMessage}
                onReplyMessage={onReplyMessage}
                onEditMessage={onEditMessage}
                onPollUpdated={onPollUpdated}
                onResendQueued={onResendQueued}
                onRemoveFromQueue={onRemoveFromQueue}
                contextMenuState={contextMenuState}
                onOpenContextMenu={openContextMenu}
                onCloseContextMenu={closeContextMenu}
                allMessages={messages}
                onScrollToMessage={onScrollToMessage}
                isChannel={isChannel}
                userChatUser1Id={userChatUser1Id}
                userChatUser2Id={userChatUser2Id}
                onChatRequestRespond={onChatRequestRespond}
                isPinned={pinnedSet.has(message.id)}
                onPin={onPin}
                onUnpin={onUnpin}
                showReply={showReply}
                onForwardMessage={onForwardMessage}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
