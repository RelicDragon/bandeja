import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { ChatMessage } from '@/api/chat';
import { CHAT_SCROLL_TARGET_SCROLL_DEFER_MS } from '@/components/chat/chatListMotion';
import { applyScrollTargetMessageHighlight } from '@/utils/scrollTargetMessageHighlight';
import {
  isMessageElementVisibleInScrollContainer,
  scrollVirtualizerToIndex,
} from '@/utils/messageListScroll';

const SCROLL_TARGET_MAX_ATTEMPTS = 48;
const SCROLL_TARGET_REMEASURE_MAX_ATTEMPTS = 8;
const USER_SCROLL_CANCEL_PX = 2;

type UseMessageListScrollTargetParams = {
  scrollTargetMessageId: string | null | undefined;
  messages: ChatMessage[];
  containerRef: RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  openScrollAtBottomRef: RefObject<boolean>;
  wasAtBottomBeforeGrowRef: RefObject<boolean>;
  userReleasedBottomIntentRef: RefObject<boolean>;
  virtualMeasureKey: string;
  reduceMotion: boolean;
  onScrollTargetReached?: (messageId: string) => void;
};

export function useMessageListScrollTarget({
  scrollTargetMessageId,
  messages,
  containerRef,
  virtualizer,
  openScrollAtBottomRef,
  wasAtBottomBeforeGrowRef,
  userReleasedBottomIntentRef,
  virtualMeasureKey,
  reduceMotion,
  onScrollTargetReached,
}: UseMessageListScrollTargetParams): void {
  const scrollStartedForTargetRef = useRef<string | null>(null);
  const scrollHighlightCancelRef = useRef(false);
  const userScrollCancelledRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const remeasureAttemptsRef = useRef(0);
  const scrollParamsRef = useRef({
    scrollTargetMessageId,
    messages,
    containerRef,
    virtualizer,
    reduceMotion,
    onScrollTargetReached,
  });
  scrollParamsRef.current = {
    scrollTargetMessageId,
    messages,
    containerRef,
    virtualizer,
    reduceMotion,
    onScrollTargetReached,
  };

  const targetPresent =
    scrollTargetMessageId != null && messages.some((m) => m.id === scrollTargetMessageId);

  const finishScrollTargetRef = useRef<(targetId: string, element: HTMLElement | null) => void>(
    () => {}
  );
  finishScrollTargetRef.current = (targetId, element) => {
    scrollStartedForTargetRef.current = targetId;
    scrollParamsRef.current.onScrollTargetReached?.(targetId);
    if (!element) return;
    window.setTimeout(() => {
      if (!scrollHighlightCancelRef.current) {
        applyScrollTargetMessageHighlight(element, {
          reducedMotion: scrollParamsRef.current.reduceMotion,
        });
      }
    }, CHAT_SCROLL_TARGET_SCROLL_DEFER_MS);
  };

  const cancelForUserScrollRef = useRef<(targetId: string) => void>(() => {});
  cancelForUserScrollRef.current = (targetId) => {
    if (scrollStartedForTargetRef.current === targetId) return;
    userScrollCancelledRef.current = true;
    scrollHighlightCancelRef.current = true;
    finishScrollTargetRef.current(targetId, null);
  };

  const tryScrollToTargetRef = useRef<() => boolean>(() => false);
  tryScrollToTargetRef.current = () => {
    const {
      scrollTargetMessageId: targetId,
      messages: msgs,
      containerRef: containerRefParam,
      virtualizer: vz,
    } = scrollParamsRef.current;

    if (!targetId || scrollStartedForTargetRef.current === targetId) {
      return true;
    }
    if (userScrollCancelledRef.current) {
      finishScrollTargetRef.current(targetId, null);
      return true;
    }

    const idx = msgs.findIndex((m) => m.id === targetId);
    if (idx < 0) return false;

    const container = containerRefParam.current;
    if (!container) return false;

    programmaticScrollRef.current = true;
    scrollVirtualizerToIndex(vz, idx, { align: 'center', behavior: 'auto' });

    const el = container.querySelector(`#message-${targetId}`) as HTMLElement | null;
    if (!el) return false;

    if (!isMessageElementVisibleInScrollContainer(container, el)) {
      programmaticScrollRef.current = true;
      el.scrollIntoView({ behavior: 'auto', block: 'center' });
      return false;
    }

    finishScrollTargetRef.current(targetId, el);
    return true;
  };

  useLayoutEffect(() => {
    if (!scrollTargetMessageId) {
      scrollStartedForTargetRef.current = null;
      return;
    }
    scrollStartedForTargetRef.current = null;
    scrollHighlightCancelRef.current = false;
    userScrollCancelledRef.current = false;
    remeasureAttemptsRef.current = 0;
    openScrollAtBottomRef.current = false;
    wasAtBottomBeforeGrowRef.current = false;
    userReleasedBottomIntentRef.current = true;
  }, [
    scrollTargetMessageId,
    openScrollAtBottomRef,
    wasAtBottomBeforeGrowRef,
    userReleasedBottomIntentRef,
  ]);

  useLayoutEffect(() => {
    if (!scrollTargetMessageId || !targetPresent) return;
    if (scrollStartedForTargetRef.current === scrollTargetMessageId) return;
    if (userScrollCancelledRef.current) return;

    scrollHighlightCancelRef.current = false;
    let attempts = 0;

    const attemptScroll = () => {
      if (
        scrollHighlightCancelRef.current ||
        userScrollCancelledRef.current ||
        attempts >= SCROLL_TARGET_MAX_ATTEMPTS
      ) {
        return;
      }
      attempts += 1;
      if (tryScrollToTargetRef.current()) return;
      requestAnimationFrame(attemptScroll);
    };

    if (tryScrollToTargetRef.current()) return;

    requestAnimationFrame(attemptScroll);
    return () => {
      scrollHighlightCancelRef.current = true;
    };
  }, [scrollTargetMessageId, targetPresent]);

  useLayoutEffect(() => {
    if (!scrollTargetMessageId || !targetPresent) return;
    if (scrollStartedForTargetRef.current === scrollTargetMessageId) return;
    if (userScrollCancelledRef.current) return;
    if (remeasureAttemptsRef.current >= SCROLL_TARGET_REMEASURE_MAX_ATTEMPTS) return;
    remeasureAttemptsRef.current += 1;
    tryScrollToTargetRef.current();
  }, [virtualMeasureKey, scrollTargetMessageId, targetPresent]);

  useEffect(() => {
    if (!scrollTargetMessageId) return;
    const container = containerRef.current;
    if (!container) return;

    const targetId = scrollTargetMessageId;
    let lastScrollTop = container.scrollTop;

    const onUserIntent = () => {
      cancelForUserScrollRef.current(targetId);
    };

    const onScroll = () => {
      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false;
        lastScrollTop = container.scrollTop;
        return;
      }
      if (Math.abs(container.scrollTop - lastScrollTop) > USER_SCROLL_CANCEL_PX) {
        cancelForUserScrollRef.current(targetId);
      }
      lastScrollTop = container.scrollTop;
    };

    container.addEventListener('wheel', onUserIntent, { passive: true });
    container.addEventListener('touchmove', onUserIntent, { passive: true });
    container.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      container.removeEventListener('wheel', onUserIntent);
      container.removeEventListener('touchmove', onUserIntent);
      container.removeEventListener('scroll', onScroll);
    };
  }, [scrollTargetMessageId, containerRef]);
}
