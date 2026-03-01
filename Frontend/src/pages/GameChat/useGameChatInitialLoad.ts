import { useEffect } from 'react';
import { chatApi, type UserChat as UserChatType } from '@/api/chat';
import { blockedUsersApi } from '@/api/blockedUsers';
import { useHeaderStore } from '@/store/headerStore';
import { usePlayersStore } from '@/store/playersStore';
import { applyQueuedMessagesToState } from '@/services/applyQueuedMessagesToState';
import { getAvailableGameChatTypes } from '@/utils/chatType';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { normalizeChatType } from '@/utils/chatType';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import type { Game } from '@/types';
import type { ChatMessageWithStatus } from '@/api/chat';

export interface UseGameChatInitialLoadParams {
  id: string | undefined;
  user: { id: string } | null;
  contextType: ChatContextType;
  initialChatType: ChatType | undefined;
  currentChatType: ChatType;
  hasSetDefaultChatType: boolean;
  loadContext: () => Promise<unknown>;
  loadMessages: (page: number, append: boolean, chatType?: ChatType) => Promise<void>;
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
  setHasSetDefaultChatType: (v: boolean) => void;
  setIsInitialLoad: (v: boolean) => void;
  setIsLoadingMessages: (v: boolean) => void;
}

export function useGameChatInitialLoad(params: UseGameChatInitialLoadParams) {
  const {
    id,
    user,
    contextType,
    initialChatType,
    currentChatType,
    hasSetDefaultChatType,
    loadContext,
    loadMessages,
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
    setHasSetDefaultChatType,
    setIsInitialLoad,
    setIsLoadingMessages,
  } = params;

  useEffect(() => {
    const ac = new AbortController();
    const signal = ac.signal;

    const loadData = async () => {
      if (!id || !user?.id) return;

      const currentLoadId = `${id}-${contextType}`;
      if (loadingIdRef.current === currentLoadId && hasLoadedRef.current) return;
      if (isLoadingRef.current && loadingIdRef.current === currentLoadId) return;

      loadingIdRef.current = currentLoadId;
      isLoadingRef.current = true;
      hasLoadedRef.current = false;
      setIsInitialLoad(true);
      setIsLoadingMessages(true);

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

        try {
          const muteStatus = await chatApi.isChatMuted(contextType, id);
          if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
          setIsMuted(muteStatus.isMuted);
        } catch (error) {
          if (!signal.aborted) console.error('Failed to check mute status:', error);
        }

        try {
          const pref = await chatApi.getChatTranslationPreference(contextType, id);
          if (signal.aborted || loadingIdRef.current !== currentLoadId) return;
          setTranslateToLanguageForChat(pref);
        } catch (error) {
          if (!signal.aborted) console.error('Failed to load translation preference:', error);
        }

        let effectiveChatType: ChatType = currentChatType;
        if (!hasSetDefaultChatType && contextType === 'GAME' && loadedContext) {
          setHasSetDefaultChatType(true);
          const loadedGame = loadedContext as Game;
          const loadedParticipant = loadedGame.participants?.find(p => p.userId === user?.id);
          const defaultType: ChatType = (loadedParticipant?.status === 'PLAYING') ? 'PRIVATE' : 'PUBLIC';
          effectiveChatType = initialChatType ?? defaultType;
          if (effectiveChatType !== currentChatType) setCurrentChatType(effectiveChatType);
        } else if (initialChatType && initialChatType !== 'PUBLIC' && contextType === 'GAME') {
          effectiveChatType = initialChatType;
          if (effectiveChatType !== currentChatType) setCurrentChatType(effectiveChatType);
        }
        if (signal.aborted) return;

        await loadMessages(1, false, contextType === 'GAME' ? effectiveChatType : undefined);
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
              chatApi.markAllMessagesAsReadForContext('GAME', id, availableChatTypes).then((markReadResponse) => {
                const markedCount = markReadResponse.data?.count || 0;
                const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
                setUnreadMessages(Math.max(0, unreadMessages - markedCount));
                window.dispatchEvent(new CustomEvent('unread-count-invalidated'));
              }).catch(() => {});
            }
          } else if (contextType === 'USER' && id) {
            chatApi.markAllMessagesAsReadForContext('USER', id).then((markReadResponse) => {
              const markedCount = markReadResponse.data?.count || 0;
              const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
              setUnreadMessages(Math.max(0, unreadMessages - markedCount));
              const { updateUnreadCount } = usePlayersStore.getState();
              updateUnreadCount(id, () => 0);
              window.dispatchEvent(new CustomEvent('unread-count-invalidated'));
            }).catch(() => {});
          } else if (contextType === 'GROUP' && id) {
            chatApi.markGroupChannelAsRead(id).then((markReadResponse) => {
              const markedCount = markReadResponse.data?.count || 0;
              const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
              setUnreadMessages(Math.max(0, unreadMessages - markedCount));
              window.dispatchEvent(new CustomEvent('unread-count-invalidated'));
            }).catch(() => {});
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
  }, [id, user, contextType, initialChatType, currentChatType, hasSetDefaultChatType, loadContext, loadMessages, userChat, handleMarkFailed, handleNewMessageRef, loadingIdRef, hasLoadedRef, isLoadingRef, messagesRef, setMessages, setCurrentChatType, setIsBlockedByUser, setIsMuted, setTranslateToLanguageForChat, setHasSetDefaultChatType, setIsInitialLoad, setIsLoadingMessages]);
}
