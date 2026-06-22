import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

import {
  isMessageListNearBottom,
  MESSAGE_LIST_NEAR_BOTTOM_PX,
} from '@/utils/messageListScroll';
import type { ThreadScrollContainerEvents } from './useThreadScrollContainerEvents';

type UseMessageListNearBottomOptions = {
  threadScrollKey: string | null;
  onChange?: (nearBottom: boolean) => void;
  messagesLength: number;
  isLoadingMessages: boolean;
  isInitialLoad: boolean;
  isSwitchingChatType: boolean;
  containerEvents: ThreadScrollContainerEvents;
};

/**
 * Reactive near-bottom for scroll-mode gating. Exposes a ref mirror for synchronous
 * reads inside message-grow effects (append pin / prepend compensation).
 */
export function useMessageListNearBottom(
  containerRef: RefObject<HTMLDivElement | null>,
  {
    threadScrollKey,
    onChange,
    messagesLength,
    isLoadingMessages,
    isInitialLoad,
    isSwitchingChatType,
    containerEvents,
  }: UseMessageListNearBottomOptions
): { isNearBottom: boolean; isNearBottomRef: RefObject<boolean> } {
  const [isNearBottom, setIsNearBottom] = useState(true);
  const isNearBottomRef = useRef(true);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const prevReportedRef = useRef(true);

  useLayoutEffect(() => {
    isNearBottomRef.current = true;
    prevReportedRef.current = true;
    setIsNearBottom(true);
    onChangeRef.current?.(true);
  }, [threadScrollKey]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const tick = () => {
      const nearBottom = isMessageListNearBottom(el, MESSAGE_LIST_NEAR_BOTTOM_PX);
      isNearBottomRef.current = nearBottom;
      if (prevReportedRef.current !== nearBottom) {
        prevReportedRef.current = nearBottom;
        setIsNearBottom(nearBottom);
        onChangeRef.current?.(nearBottom);
      }
    };

    const unsubscribe = containerEvents.subscribe(tick);
    containerEvents.tick();
    return unsubscribe;
  }, [
    containerRef,
    containerEvents,
    threadScrollKey,
    messagesLength,
    isLoadingMessages,
    isInitialLoad,
    isSwitchingChatType,
  ]);

  return { isNearBottom, isNearBottomRef };
}
