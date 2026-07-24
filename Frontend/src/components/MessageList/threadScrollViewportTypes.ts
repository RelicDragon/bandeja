import type { RefObject } from 'react';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import type { Transition } from 'framer-motion';
import type { ChatMessage } from '@/api/chat';
import type { ThreadInitialScroll } from '@/services/chat/chatOpenScrollPolicy';
import type { MessageListHandle } from './types';
import type { MessageListSettlingRefs } from './messageListSettlingContext';

/**
 * ThreadScrollViewport — execution seam for chat thread scroll.
 *
 * Policy decisions live in `threadScrollPolicy`; this module owns how they are applied.
 *
 * ## Scroll modes (layout motion)
 * - **Tail zone** (`nearBottom` or `threadLayoutSettling`): animated list height / row translateY.
 * - **Mid-history** (`!nearBottom`): instant layout so anchor compensation is not fighting motion.
 * - **`prefers-reduced-motion`**: all layout transitions disabled.
 *
 * ## When to pin bottom
 * - Open with `{ atBottom: true }` → pin after layout (open restore).
 * - Settling + open-at-bottom → ResizeObserver pin loop (`decideSettlingPinApply`).
 * - Append while at bottom (not settling) → instant pin (`decideNewMessagesScrollApply`).
 * - Initial load complete while still near bottom → one smooth pin (never force-align mid-history).
 * - User scroll away from tail clears open-at-bottom intent (except during settling / programmatic pins).
 * - Same-thread network hydrate must not re-apply open-at-bottom or resurrect pin intent.
 * - Async reconcile/socket pin only if the live viewport is still at the tail.
 *
 * ## When to compensate prepend
 * - Load-more completion, prepend reconcile, or older-page merge (`prepend-compensate`).
 * - Single snapshot + one layout-pass `scrollTop` delta; epoch bumps skip scroll-anchor.
 *
 * ## When to preserve anchor (scroll-anchor hook)
 * - Row height remeasure above viewport while mid-history.
 * - Skipped during load-more and immediately after prepend compensation.
 *
 * ## Scroll persistence
 * - Saved on container scroll via multiplexer; flushed on unmount.
 * - Skipped while settling and visually near bottom (tail pin owns position).
 */
export type ThreadScrollViewportInput = {
  messages: ChatMessage[];
  threadScrollKey: string | null;
  initialScroll?: ThreadInitialScroll;
  highlightAnchorMessageId?: string;
  openPaintGeneration?: number;
  threadLayoutSettling: boolean;
  onChatScrollNearBottomChange?: (nearBottom: boolean) => void;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  isInitialLoad?: boolean;
  isLoadingMessages?: boolean;
  isSwitchingChatType?: boolean;
  scrollTargetMessageId?: string | null;
  loadingScrollTargetId?: string | null;
  onScrollTargetReached?: (messageId: string) => void;
  hasContextPanel?: boolean;
  reduceMotion: boolean;
};

export type ThreadScrollViewportRenderContext = {
  virtualItems: VirtualItem[];
  rowCount: number;
  totalHeight: number;
  measureElement: Virtualizer<HTMLDivElement, Element>['measureElement'];
  rowStyles: Map<string, { transform: string; transition?: string }>;
  heightTransition: Transition;
  rowLayoutTransitionEnabled: boolean;
  eagerMediaMessageIds: Set<string>;
};

export type ThreadScrollViewportResult = {
  containerRef: RefObject<HTMLDivElement | null>;
  innerListRef: RefObject<HTMLDivElement | null>;
  topLoadSentinelRef: RefObject<HTMLDivElement | null>;
  settlingRefs: MessageListSettlingRefs;
  renderContext: ThreadScrollViewportRenderContext;
  imperativeHandle: MessageListHandle;
};
