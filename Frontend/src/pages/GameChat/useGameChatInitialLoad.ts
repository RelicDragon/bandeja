import { useEffect, useRef } from 'react';
import {
  chatApi,
  type ChatContextType,
  type ChatMessageWithStatus,
  type GroupChannel,
  type UserChat as UserChatType,
} from '@/api/chat';
import { blockedUsersApi } from '@/api/blockedUsers';
import { useHeaderStore } from '@/store/headerStore';
import { usePlayersStore } from '@/store/playersStore';
import { applyQueuedMessagesToState } from '@/services/applyQueuedMessagesToState';
import { getAvailableGameChatTypes } from '@/utils/chatType';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { normalizeChatType } from '@/utils/chatType';
import { shouldQueueChatMutation } from '@/services/chat/chatMutationNetwork';
import { enqueueChatMutationMarkReadBatch } from '@/services/chat/chatMutationEnqueue';
import type { ChatType } from '@/types';
import type { Game } from '@/types';

export interface UseGameChatInitialLoadParams {
  id: string | undefined;
  user: { id: string } | null;
  contextType: ChatContextType;
  initialChatType: ChatType | undefined;
  currentChatType: ChatType;
  loadContext: () => Promise<unknown>;
  bootstrapThread: (gameChatType?: ChatType) => Promise<boolean>;
  userChat: UserChatType | null;
  handleMarkFailed: (tempId: string) => void;
  handleNewMessageRef: React.MutableRefObject<((message: import('@/api/chat').ChatMessage) => string | void) | undefined>;
  loadingIdRef: React.MutableRefObject<string | undefined>;
  hasLoadedRef: React.MutableRefObject<boolean>;
  isLoadingRef: React.MutableRefObject<boolean>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
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
    loadContext,
    bootstrapThread,
    userChat,
    handleMarkFailed,
    handleNewMessageRef,
    loadingIdRef,
    hasLoadedRef,
    isLoadingRef,
    messagesRef,
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
  const gameDefaultsAppliedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const signal = ac.signal;

    const loadData = async () => {
      if (!id || !user?.id) {
        setIsLoadingContext(false);
        return;
      }

      const currentLoadId = `${id}-${contextType}`;
      if (isLoadingRef.current && loadingIdRef.current === currentLoadId) return;

      loadingIdRef.current = currentLoadId;
      isLoadingRef.current = true;
      hasLoadedRef.current = false;
      const hasCachedThread = messagesRef.current.length > 0;
      if (!hasCachedThread) {
        setIsInitialLoad(true);
        setIsLoadingMessages(true);
      }

      try {
        const loadedContext = await loadContext();
        if (signal.aborted || loadingIdRef.current !== currentLoadId) return;

        if (contextType === 'USER' && user?.id) {
          const uc = (loadedContext || userChat) as UserChatType | null;
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
          const uc = (loadedContext || userChat) as UserChatType | null;
          if (uc && typeof uc.isMuted === 'boolean') muteFromContext = uc.isMuted;
        } else if (contextType === 'GROUP') {
          const gc = loadedContext as GroupChannel | null;
          if (gc && typeof gc.isMuted === 'boolean') muteFromContext = gc.isMuted;
        }

        if (muteFromContext !== undefined) {
          if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
          setIsMuted(muteFromContext);
        } else {
          try {
            const muteStatus = await chatApi.isChatMuted(contextType, id);
            if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
            setIsMuted(muteStatus.isMuted);
          } catch (error) {
            if (!signal.aborted) console.error('Failed to check mute status:', error);
          }
        }

        try {
          const pref = await chatApi.getChatTranslationPreference(contextType, id);
          if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
          setTranslateToLanguageForChat(pref);
        } catch (error) {
          if (!signal.aborted) console.error('Failed to load translation preference:', error);
        }

        const contextKey = `${id}-${contextType}`;
        let effectiveChatType: ChatType = currentChatTypeRef.current;
        let committedGameDefaultsKey: string | null = null;
        if (contextType === 'GAME' && gameDefaultsAppliedKeyRef.current !== contextKey) {
          let resolved = currentChatTypeRef.current;
          if (loadedContext) {
            const loadedGame = loadedContext as Game;
            const loadedParticipant = loadedGame.participants?.find((p) => p.userId === user?.id);
            const defaultType: ChatType = loadedParticipant?.status === 'PLAYING' ? 'PRIVATE' : 'PUBLIC';
            resolved = initialChatType ?? defaultType;
          } else if (initialChatType) {
            resolved = initialChatType;
          }
          effectiveChatType = resolved;
          if (resolved !== currentChatTypeRef.current) setCurrentChatType(resolved);
          committedGameDefaultsKey = contextKey;
        }
        if (signal.aborted) return;
        if (committedGameDefaultsKey) gameDefaultsAppliedKeyRef.current = committedGameDefaultsKey;

        await bootstrapThread(contextType === 'GAME' ? effectiveChatType : undefined);
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
            handleMarkFailed,
            onMessageCreated: (created) => handleNewMessageRef.current?.(created),
          });
        }
        if (!signal.aborted) hasLoadedRef.current = true;

        const runMarkReadBackground = () => {
          if (contextType === 'GAME' && loadedContext) {
            const loadedGame = loadedContext as Game;
            const loadedUserParticipant = loadedGame.participants.find(p => p.userId === user.id);
            const loadedIsParticipant = !!loadedUserParticipant;
            const loadedHasPendingInvite = loadedGame.participants?.some(p => p.userId === user.id && p.status === 'INVITED') ?? false;
            const loadedIsGuest = loadedGame.participants.some(p => p.userId === user.id && (p.status === 'GUEST' || !isParticipantPlaying(p))) ?? false;
            if (loadedIsParticipant || loadedHasPendingInvite || loadedIsGuest || loadedGame.isPublic) {
              const loadedParentParticipant = loadedGame.parent?.participants?.find(p => p.userId === user.id);
              const availableChatTypes = getAvailableGameChatTypes(loadedGame, loadedUserParticipant ?? undefined, loadedParentParticipant ?? undefined);
              if (shouldQueueChatMutation() && id) {
                void enqueueChatMutationMarkReadBatch({
                  contextType: 'GAME',
                  contextId: id,
                  payload: { target: 'context', chatTypes: availableChatTypes as ChatType[] },
                });
                return;
              }
              chatApi.markAllMessagesAsReadForContext('GAME', id, availableChatTypes).then((markReadResponse) => {
                const markedCount = markReadResponse.data?.count || 0;
                const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
                setUnreadMessages(Math.max(0, unreadMessages - markedCount));
                window.dispatchEvent(new CustomEvent('unread-count-invalidated'));
              }).catch(() => {});
            }
          } else if (contextType === 'USER' && id) {
            if (shouldQueueChatMutation()) {
              void enqueueChatMutationMarkReadBatch({
                contextType: 'USER',
                contextId: id,
                payload: { target: 'context' },
              });
            } else {
              chatApi.markAllMessagesAsReadForContext('USER', id).then((markReadResponse) => {
                const markedCount = markReadResponse.data?.count || 0;
                const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
                setUnreadMessages(Math.max(0, unreadMessages - markedCount));
                const { updateUnreadCount } = usePlayersStore.getState();
                updateUnreadCount(id, () => 0);
                window.dispatchEvent(new CustomEvent('unread-count-invalidated'));
              }).catch(() => {});
            }
          } else if (contextType === 'GROUP' && id) {
            if (shouldQueueChatMutation()) {
              void enqueueChatMutationMarkReadBatch({
                contextType: 'GROUP',
                contextId: id,
                payload: { target: 'group_channel' },
              });
            } else {
              chatApi.markGroupChannelAsRead(id).then((markReadResponse) => {
                const markedCount = markReadResponse.data?.count || 0;
                const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
                setUnreadMessages(Math.max(0, unreadMessages - markedCount));
                window.dispatchEvent(new CustomEvent('unread-count-invalidated'));
              }).catch(() => {});
            }
          }
        };
        runMarkReadBackground();
      } finally {
        if (!signal.aborted) isLoadingRef.current = false;
      }
    };

    loadData();

    return () => {
      ac.abort();
      if (loadingIdRef.current === `${id}-${contextType}`) isLoadingRef.current = false;
    };
  }, [
    id,
    user,
    contextType,
    initialChatType,
    loadContext,
    bootstrapThread,
    userChat,
    handleMarkFailed,
    handleNewMessageRef,
    loadingIdRef,
    hasLoadedRef,
    isLoadingRef,
    messagesRef,
    setMessages,
    setCurrentChatType,
    setIsBlockedByUser,
    setIsMuted,
    setTranslateToLanguageForChat,
    setIsInitialLoad,
    setIsLoadingMessages,
    setIsLoadingContext,
  ]);
}
