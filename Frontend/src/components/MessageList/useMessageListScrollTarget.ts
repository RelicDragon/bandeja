import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { ChatMessage } from '@/api/chat';
import { CHAT_SCROLL_TARGET_SCROLL_DEFER_MS } from '@/components/chat/chatListMotion';
import { applyScrollTargetMessageHighlight } from '@/utils/scrollTargetMessageHighlight';
import { scrollVirtualizerToIndex } from '@/utils/messageListScroll';

const SCROLL_TARGET_MAX_ATTEMPTS = 24;

type UseMessageListScrollTargetParams = {
  scrollTargetMessageId: string | null | undefined;
  messages: ChatMessage[];
  containerRef: RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  openScrollAtBottomRef: RefObject<boolean>;
  wasAtBottomBeforeGrowRef: RefObject<boolean>;
  virtualMeasureKey: string;
  reduceMotion: boolean;
};

export function useMessageListScrollTarget({
  scrollTargetMessageId,
  messages,
  containerRef,
  virtualizer,
  openScrollAtBottomRef,
  wasAtBottomBeforeGrowRef,
  virtualMeasureKey,
  reduceMotion,
}: UseMessageListScrollTargetParams): void {
  const scrollStartedForTargetRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!scrollTargetMessageId) {
      scrollStartedForTargetRef.current = null;
      return;
    }
    openScrollAtBottomRef.current = false;
    wasAtBottomBeforeGrowRef.current = false;
  }, [scrollTargetMessageId, openScrollAtBottomRef, wasAtBottomBeforeGrowRef]);

  useLayoutEffect(() => {
    if (!scrollTargetMessageId) return;
    if (scrollStartedForTargetRef.current === scrollTargetMessageId) return;

    const idx = messages.findIndex((m) => m.id === scrollTargetMessageId);
    if (idx < 0) return;

    let cancelled = false;
    let attempts = 0;
    const behavior = reduceMotion ? 'auto' : ('smooth' as ScrollBehavior);

    const finishScroll = (el: HTMLElement) => {
      scrollStartedForTargetRef.current = scrollTargetMessageId;
      el.scrollIntoView({ behavior, block: 'center' });
      window.setTimeout(() => {
        if (!cancelled) {
          applyScrollTargetMessageHighlight(el, { reducedMotion: reduceMotion });
        }
      }, CHAT_SCROLL_TARGET_SCROLL_DEFER_MS);
    };

    const attemptScroll = () => {
      if (cancelled || attempts >= SCROLL_TARGET_MAX_ATTEMPTS) return;
      attempts += 1;

      const el = containerRef.current?.querySelector(
        `#message-${scrollTargetMessageId}`
      ) as HTMLElement | null;

      if (el) {
        finishScroll(el);
        return;
      }

      scrollVirtualizerToIndex(virtualizer, idx, {
        align: 'center',
        behavior,
      });
      requestAnimationFrame(attemptScroll);
    };

    requestAnimationFrame(attemptScroll);
    return () => {
      cancelled = true;
    };
  }, [
    scrollTargetMessageId,
    messages,
    virtualMeasureKey,
    containerRef,
    virtualizer,
    reduceMotion,
  ]);
}
