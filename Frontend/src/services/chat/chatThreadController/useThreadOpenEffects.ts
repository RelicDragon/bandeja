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
import { scheduleChatOpenIdle } from '@/utils/chatOpenIdle';
import type { ThreadOpenOutboxContext } from '@/services/chat/threadOpen';
import type { ChatType } from '@/types';
import type { Game } from '@/types';
import type { ChatThreadController } from './ChatThreadController';
import {
  dropArchivedGameOutbox,
  isThreadArchivedInMemory,
} from '@/services/chat/chatThreadLifecycle';

export interface UseThreadOpenEffectsParams {
  id: string | undefined;
  user: { id: string } | null;
  contextType: ChatContextType;
  initialChatType: ChatType | undefined;
  currentChatType: ChatType;
  game: Game | null;
  groupChannelId?: string;
  loadContext: (options?: import('@/pages/GameChat/useGameChatContext').LoadContextOptions) => Promise<unknown>;
  bootstrapThread: (gameChatType?: ChatType, outbox?: ThreadOpenOutboxContext) => Promise<boolean>;
  userChat: UserChatType | null;
  handleMarkFailed: (tempId: string) => void;
  handleReplaceOptimistic: (tempId: string, message: import('@/api/chat').ChatMessage) => void;
  handleNewMessageRef: React.MutableRefObject<((message: import('@/api/chat').ChatMessage) => string | void) | undefined>;
  loadingIdRef: React.MutableRefObject<string | undefined>;
  hasLoadedRef: React.MutableRefObject<boolean>;
  isLoadingRef: React.MutableRefObject<boolean>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  openPaintCommittedRef: React.MutableRefObject<boolean>;
  /** When set, re-run bootstrap even if this thread was already opened. */
  freshOpenSignal?: number;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  setCurrentChatType: (t: ChatType) => void;
  setIsBlockedByUser: (v: boolean) => void;
  setIsMuted: (v: boolean) => void;
  setTranslateToLanguageForChat: (v: string | null) => void;
  setIsInitialLoad: (v: boolean) => void;
  setIsLoadingMessages: (v: boolean) => void;
  setIsLoadingContext: (v: boolean) => void;
  controllerRef: React.RefObject<ChatThreadController>;
  isGameChatArchived?: boolean;
}

export function useThreadOpenEffects(params: UseThreadOpenEffectsParams) {
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
    freshOpenSignal = 0,
    setMessages,
    setCurrentChatType,
    setIsBlockedByUser,
    setIsMuted,
    setTranslateToLanguageForChat,
    setIsInitialLoad,
    setIsLoadingMessages,
    setIsLoadingContext,
    controllerRef,
    isGameChatArchived = false,
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
  const userRef = useRef(user);
  userRef.current = user;
  const initialChatTypeRef = useRef(initialChatType);
  initialChatTypeRef.current = initialChatType;
  const freshOpenSignalRef = useRef(freshOpenSignal);
  freshOpenSignalRef.current = freshOpenSignal;

  useEffect(() => {
    const ac = new AbortController();
    const signal = ac.signal;

    const loadData = async () => {
      if (!id || !user?.id) {
        setIsLoadingContext(false);
        setIsLoadingMessages(false);
        setIsInitialLoad(false);
        return;
      }

      if (freshOpenSignalRef.current) {
        hasLoadedRef.current = false;
        openPaintCommittedRef.current = false;
        loadingIdRef.current = undefined;
        isLoadingRef.current = false;
      }

      const currentLoadId = `${id}-${contextType}`;
      if (!freshOpenSignalRef.current && hasLoadedRef.current && loadingIdRef.current === currentLoadId) {
        return;
      }
      if (isLoadingRef.current && loadingIdRef.current === currentLoadId && !freshOpenSignalRef.current) {
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

        const contextArchived =
          contextType === 'GAME' && !!id && isThreadArchivedInMemory('GAME', id);
        if (contextArchived && contextType === 'GAME') {
          await dropArchivedGameOutbox(id);
        }

        const loadedGame =
          contextType === 'GAME' ? ((loadedContext as Game | null) ?? gameRef.current) : null;
        if (!contextArchived) {
          controllerRef.current.markReadOnEnter({
            id,
            contextType,
            game: loadedGame,
            userId: user?.id,
            gameChatType: currentChatTypeRef.current,
            groupChannelId: groupChannelIdRef.current,
          });
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

        const contextKey = `${id}-${contextType}-${initialChatTypeRef.current ?? ''}`;
        let effectiveChatType: ChatType = currentChatTypeRef.current;
        let committedGameDefaultsKey: string | null = null;
        if (contextType === 'GAME' && gameDefaultsAppliedKeyRef.current !== contextKey) {
          let resolved = currentChatTypeRef.current;
          if (loadedContext) {
            resolved = initialChatTypeRef.current ?? 'PUBLIC';
          } else if (initialChatTypeRef.current) {
            resolved = initialChatTypeRef.current;
          }
          effectiveChatType = resolved;
          if (resolved !== currentChatTypeRef.current) setCurrentChatType(resolved);
          committedGameDefaultsKey = contextKey;
        }
        if (signal.aborted) return;
        if (committedGameDefaultsKey) gameDefaultsAppliedKeyRef.current = committedGameDefaultsKey;

        const activeUser = userRef.current;
        const outboxCtx: ThreadOpenOutboxContext | undefined = activeUser?.id
          ? { userId: activeUser.id, user: activeUser as import('@/types').BasicUser }
          : undefined;
        await bootstrapThreadRef.current(
          contextType === 'GAME' ? effectiveChatType : undefined,
          outboxCtx
        );
        if (signal.aborted || loadingIdRef.current !== currentLoadId) return;

        if (activeUser?.id && !contextArchived) {
          await applyQueuedMessagesToState({
            contextType,
            contextId: id,
            currentChatType: normalizeChatType(effectiveChatType),
            userId: activeUser.id,
            user: activeUser as import('@/types').BasicUser,
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
  }, [
    id,
    user?.id,
    contextType,
    freshOpenSignal,
    hasLoadedRef,
    loadingIdRef,
    isLoadingRef,
    messagesRef,
    openPaintCommittedRef,
    handleNewMessageRef,
    setMessages,
    setCurrentChatType,
    setIsBlockedByUser,
    setIsMuted,
    setTranslateToLanguageForChat,
    setIsInitialLoad,
    setIsLoadingMessages,
    setIsLoadingContext,
    controllerRef,
    isGameChatArchived,
  ]);
}
