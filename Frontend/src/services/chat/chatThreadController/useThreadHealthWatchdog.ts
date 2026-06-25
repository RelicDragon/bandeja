import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { ChatMessageWithStatus, ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { loadLocalThreadBootstrap } from '@/services/chat/chatLocalApply';
import {
  getThreadOpenPaintGeneration,
  isThreadOpenSettling,
  reconcileAfterPaint,
} from '@/services/chat/threadOpen';
import { useChatSyncStore } from '@/store/chatSyncStore';
import {
  buildThreadLiveConfig,
  detectThreadUiDexieDivergence,
  logThreadHealthDivergence,
  THREAD_HEALTH_WATCHDOG_INTERVAL_MS,
} from '@/services/chat/threadHealthWatchdog';
import type { ThreadScrollPosition } from '@/services/chat/chatThreadScroll';

export type UseThreadHealthWatchdogParams = {
  enabled: boolean;
  threadKey: string;
  contextType: ChatContextType;
  contextId: string | undefined;
  gameChatType: ChatType;
  viewerUserId: string;
  messagesRef: RefObject<ChatMessageWithStatus[]>;
  currentIdRef: RefObject<string | undefined>;
  openPaintCommittedRef: RefObject<boolean>;
  getScrollRow: () => ThreadScrollPosition | undefined;
  setMessages: Dispatch<SetStateAction<ChatMessageWithStatus[]>>;
};

export function useThreadHealthWatchdog({
  enabled,
  threadKey,
  contextType,
  contextId,
  gameChatType,
  viewerUserId,
  messagesRef,
  currentIdRef,
  openPaintCommittedRef,
  getScrollRow,
  setMessages,
}: UseThreadHealthWatchdogParams): void {
  const checkInFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !contextId) return;

    const intervalId = window.setInterval(() => {
      if (!contextId || currentIdRef.current !== contextId) return;
      if (!openPaintCommittedRef.current) return;
      if (isThreadOpenSettling()) return;
      if (useChatSyncStore.getState().isOpenSyncing) return;
      if (checkInFlightRef.current) return;

      checkInFlightRef.current = true;
      void (async () => {
        try {
          if (currentIdRef.current !== contextId) return;

          const { messages: dexieTail } = await loadLocalThreadBootstrap(
            contextType,
            contextId,
            gameChatType
          );
          if (currentIdRef.current !== contextId) return;

          const uiMessages = messagesRef.current;
          const config = buildThreadLiveConfig(
            contextType,
            contextId,
            viewerUserId,
            contextType === 'GAME' ? gameChatType : undefined
          );
          const divergence = detectThreadUiDexieDivergence(uiMessages, dexieTail, config);
          if (!divergence) return;

          logThreadHealthDivergence(threadKey, divergence);

          await reconcileAfterPaint({
            threadKey,
            paintGeneration: getThreadOpenPaintGeneration(threadKey),
            contextType,
            contextId,
            gameChatType,
            currentIdRef,
            messagesRef,
            setMessages,
            scrollRow: getScrollRow(),
          });
        } finally {
          checkInFlightRef.current = false;
        }
      })();
    }, THREAD_HEALTH_WATCHDOG_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    enabled,
    threadKey,
    contextType,
    contextId,
    gameChatType,
    viewerUserId,
    messagesRef,
    currentIdRef,
    openPaintCommittedRef,
    getScrollRow,
    setMessages,
  ]);
}
