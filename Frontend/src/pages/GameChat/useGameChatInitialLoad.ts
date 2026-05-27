import { useEffect, useRef } from 'react';
import {
  chatApi,
  type ChatContextType,
  type ChatMessageWithStatus,
  type GroupChannel,
  type UserChat as UserChatType,
} from '@/api/chat';
import { blockedUsersApi } from '@/api/blockedUsers';
import { applyQueuedMessagesToState } from '@/services/applyQueuedMessagesToState';
import { scheduleRetryStuckChatOutbox } from '@/services/chat/chatOutboxRetry';
import { reconcileOutboxForContext } from '@/services/chat/chatOutboxReconcile';
import { normalizeChatType } from '@/utils/chatType';
import { enterContextAndMarkRead } from '@/services/chat/unreadCoordinator';
import { buildGameChatMarkReadParams } from '@/services/chat/gameChatMarkReadParams';
import { scheduleChatOpenIdle } from '@/utils/chatOpenIdle';
import type { BootstrapOutboxContext } from './useGameChatMessages';
import type { ChatType } from '@/types';
import type { Game } from '@/types';

export interface UseGameChatInitialLoadParams {
  id: string | undefined;
  user: { id: string } | null;
  contextType: ChatContextType;
  initialChatType: ChatType | undefined;
  currentChatType: ChatType;
  game: Game | null;
  groupChannelId?: string;
  loadContext: (options?: import('./useGameChatContext').LoadContextOptions) => Promise<unknown>;
  bootstrapThread: (gameChatType?: ChatType, outbox?: BootstrapOutboxContext) => Promise<boolean>;
  userChat: UserChatType | null;
  handleMarkFailed: (tempId: string) => void;
  handleReplaceOptimistic: (tempId: string, message: import('@/api/chat').ChatMessage) => void;
  handleNewMessageRef: React.MutableRefObject<((message: import('@/api/chat').ChatMessage) => string | void) | undefined>;
  loadingIdRef: React.MutableRefObject<string | undefined>;
  hasLoadedRef: React.MutableRefObject<boolean>;
  isLoadingRef: React.MutableRefObject<boolean>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  openPaintCommittedRef: React.MutableRefObject<boolean>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  setCurrentChatType: (t: ChatType) => void;
  setIsBlockedByUser: (v: boolean) => void;
  setIsMuted: (v: boolean) => void;
  setTranslateToLanguageForChat: (v: string | null) => void;
  setIsInitialLoad: (v: boolean) => void;
  setIsLoadingMessages: (v: boolean) => void;
  setIsLoadingContext: (v: boolean) => void;
}

export function useGameChatInitialLoad(params: UseGameChatInitialLoadParams) {
  const {
    id,
    user,
    contextType,
    initialChatType,
    currentChatType,
    game,
    groupChannelId,
    loadContext,
    bootstrapThread,
    userChat,
    handleMarkFailed,
    handleReplaceOptimistic,
    handleNewMessageRef,
    loadingIdRef,
    hasLoadedRef,
    isLoadingRef,
    messagesRef,
    openPaintCommittedRef,
    setMessages,
    setCurrentChatType,
    setIsBlockedByUser,
    setIsMuted,
    setTranslateToLanguageForChat,
    setIsInitialLoad,
    setIsLoadingMessages,
    setIsLoadingContext,
  } = params;

  const currentChatTypeRef = useRef(currentChatType);
  currentChatTypeRef.current = currentChatType;
  const userChatRef = useRef(userChat);
  userChatRef.current = userChat;
  const gameDefaultsAppliedKeyRef = useRef<string | null>(null);
  const bootstrapThreadRef = useRef(bootstrapThread);
  bootstrapThreadRef.current = bootstrapThread;
  const loadContextRef = useRef(loadContext);
  loadContextRef.current = loadContext;
  const gameRef = useRef(game);
  gameRef.current = game;
  const handleMarkFailedRef = useRef(handleMarkFailed);
  handleMarkFailedRef.current = handleMarkFailed;
  const handleReplaceOptimisticRef = useRef(handleReplaceOptimistic);
  handleReplaceOptimisticRef.current = handleReplaceOptimistic;
  const groupChannelIdRef = useRef(groupChannelId);
  groupChannelIdRef.current = groupChannelId;

  useEffect(() => {
    const ac = new AbortController();
    const signal = ac.signal;

    const loadData = async () => {
      if (!id || !user?.id) {
        setIsLoadingContext(false);
        return;
      }

      const currentLoadId = `${id}-${contextType}`;
      if (hasLoadedRef.current && loadingIdRef.current === currentLoadId) {
        return;
      }
      if (openPaintCommittedRef.current && loadingIdRef.current === currentLoadId) {
        return;
      }
      if (isLoadingRef.current && loadingIdRef.current === currentLoadId) {
        return;
      }

      const prevLoadId = loadingIdRef.current;
      loadingIdRef.current = currentLoadId;
      isLoadingRef.current = true;
      if (prevLoadId !== currentLoadId) {
        hasLoadedRef.current = false;
      }
      setIsLoadingContext(true);
      if (!openPaintCommittedRef.current) {
        setIsInitialLoad(true);
        setIsLoadingMessages(true);
      }

      try {
        const loadedContext = await loadContextRef.current();
        if (signal.aborted || loadingIdRef.current !== currentLoadId) return;

        const loadedGame =
          contextType === 'GAME' ? ((loadedContext as Game | null) ?? gameRef.current) : null;
        const markReadParams = buildGameChatMarkReadParams({
          id,
          contextType,
          game: loadedGame,
          userId: user?.id,
          gameChatType: currentChatTypeRef.current,
          groupChannelId: groupChannelIdRef.current,
        });
        if (markReadParams) {
          void enterContextAndMarkRead(markReadParams);
        }

        if (contextType === 'USER' && user?.id) {
          const uc = (loadedContext || userChatRef.current) as UserChatType | null;
          const otherUserId = uc ? (uc.user1Id === user.id ? uc.user2Id : uc.user1Id) : null;
          if (otherUserId) {
            try {
              const blockedBy = await blockedUsersApi.checkIfBlockedByUser(otherUserId);
              if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
              setIsBlockedByUser(blockedBy);
            } catch (error) {
              if (!signal.aborted) console.error('Failed to check if blocked by user:', error);
            }
          }
        }

        let muteFromContext: boolean | undefined;
        if (contextType === 'USER') {
          const uc = (loadedContext || userChatRef.current) as UserChatType | null;
          if (uc && typeof uc.isMuted === 'boolean') muteFromContext = uc.isMuted;
        } else if (contextType === 'GROUP') {
          const gc = loadedContext as GroupChannel | null;
          if (gc && typeof gc.isMuted === 'boolean') muteFromContext = gc.isMuted;
        }

        const applyMute = async () => {
          if (muteFromContext !== undefined) {
            if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
            setIsMuted(muteFromContext);
            return;
          }
          try {
            const muteStatus = await chatApi.isChatMuted(contextType, id);
            if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
            setIsMuted(muteStatus.isMuted);
          } catch (error) {
            if (!signal.aborted) console.error('Failed to check mute status:', error);
          }
        };

        const applyTranslationPref = async () => {
          try {
            const pref = await chatApi.getChatTranslationPreference(contextType, id);
            if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
            setTranslateToLanguageForChat(pref);
          } catch (error) {
            if (!signal.aborted) console.error('Failed to load translation preference:', error);
          }
        };

        scheduleChatOpenIdle(() => {
          void applyMute();
          void applyTranslationPref();
        });

        const contextKey = `${id}-${contextType}-${initialChatType ?? ''}`;
        let effectiveChatType: ChatType = currentChatTypeRef.current;
        let committedGameDefaultsKey: string | null = null;
        if (contextType === 'GAME' && gameDefaultsAppliedKeyRef.current !== contextKey) {
          let resolved = currentChatTypeRef.current;
          if (loadedContext) {
            resolved = initialChatType ?? 'PUBLIC';
          } else if (initialChatType) {
            resolved = initialChatType;
          }
          effectiveChatType = resolved;
          if (resolved !== currentChatTypeRef.current) setCurrentChatType(resolved);
          committedGameDefaultsKey = contextKey;
        }
        if (signal.aborted) return;
        if (committedGameDefaultsKey) gameDefaultsAppliedKeyRef.current = committedGameDefaultsKey;

        const outboxCtx: BootstrapOutboxContext | undefined = user?.id
          ? { userId: user.id, user: user as import('@/types').BasicUser }
          : undefined;
        await bootstrapThreadRef.current(
          contextType === 'GAME' ? effectiveChatType : undefined,
          outboxCtx
        );
        if (signal.aborted || loadingIdRef.current !== currentLoadId) return;

        if (user?.id) {
          await applyQueuedMessagesToState({
            contextType,
            contextId: id,
            currentChatType: normalizeChatType(effectiveChatType),
            userId: user.id,
            user: user as import('@/types').BasicUser,
            messagesRef,
            setMessages,
            handleMarkFailed: handleMarkFailedRef.current,
            onOptimisticReplaced: handleReplaceOptimisticRef.current,
            onMessageCreated: (created) => handleNewMessageRef.current?.(created),
            paintState: !outboxCtx,
          });
          await reconcileOutboxForContext(contextType, id);
          scheduleRetryStuckChatOutbox();
        }
        if (!signal.aborted) hasLoadedRef.current = true;

        if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
      } finally {
        if (loadingIdRef.current === currentLoadId) {
          setIsLoadingContext(false);
          isLoadingRef.current = false;
        }
      }
    };

    loadData();

    return () => {
      ac.abort();
      if (loadingIdRef.current === `${id}-${contextType}`) isLoadingRef.current = false;
    };
    // Intentionally narrow deps: unstable callbacks/refs must not re-trigger full open (bootstrap + reconcile).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per id+contextType via refs + hasLoadedRef
  }, [id, user?.id, contextType, initialChatType]);
}
