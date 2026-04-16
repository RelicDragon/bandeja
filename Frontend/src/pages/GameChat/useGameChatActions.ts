import { useCallback, useMemo } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { chatApi } from '@/api/chat';
import { gamesApi } from '@/api/games';
import { useHeaderStore } from '@/store/headerStore';
import { applyQueuedMessagesToState } from '@/services/applyQueuedMessagesToState';
import { loadLocalThreadBootstrap, persistChatMessagesFromApi } from '@/services/chat/chatLocalApply';
import { reconcileChatThreadOpen } from '@/services/chat/chatOpenReconcile';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { normalizeChatType } from '@/utils/chatType';
import { mergeChatMessagesAscending, mergeServerPageWithPendingOptimistics } from '@/utils/chatMessageSort';
import { shouldQueueChatMutation } from '@/services/chat/chatMutationNetwork';
import { enqueueChatMutationMarkReadBatch } from '@/services/chat/chatMutationEnqueue';
import { applyOptimisticMarkGameRead } from '@/services/chat/applyOptimisticMarkContextRead';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import type { Game } from '@/types';
import type { GroupChannel } from '@/api/chat';
import type { ChatMessageWithStatus } from '@/api/chat';
import type { RefObject } from 'react';

export interface UseGameChatActionsParams {
  currentIdRef: RefObject<string | undefined>;
  id: string | undefined;
  contextType: ChatContextType;
  loadContext: () => Promise<unknown>;
  navigate: NavigateFunction;
  setChatsFilter: (filter: 'users' | 'bugs' | 'channels' | 'market') => void;
  setGame: (game: Game | null | ((prev: Game | null) => Game | null)) => void;
  setGroupChannel: (ch: GroupChannel | null | ((prev: GroupChannel | null) => GroupChannel | null)) => void;
  groupChannel: GroupChannel | null;
  userParticipant: { status?: string } | undefined;
  currentChatType: ChatType;
  setCurrentChatType: (t: ChatType) => void;
  setPage: (n: number) => void;
  setHasMoreMessages: (v: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  setIsSwitchingChatType: (v: boolean) => void;
  setIsLoadingMessages: (v: boolean) => void;
  setIsInitialLoad: (v: boolean) => void;
  handleMarkFailed: (tempId: string) => void;
  handleNewMessageRef: React.MutableRefObject<(message: import('@/api/chat').ChatMessage) => string | void>;
  scrollToBottom: () => void;
  user: { id: string } | null;
  isLeavingChat: boolean;
  setIsLeavingChat: (v: boolean) => void;
  setShowLeaveConfirmation: (v: boolean) => void;
  setIsJoiningAsGuest: (v: boolean) => void;
  setIsMuted: (v: boolean) => void;
  setIsTogglingMute: (v: boolean) => void;
  isMuted: boolean;
}

export function useGameChatActions(params: UseGameChatActionsParams) {
  const { t } = useTranslation();
  const {
    currentIdRef,
    id,
    contextType,
    loadContext,
    navigate,
    setChatsFilter,
    setGame,
    setGroupChannel,
    groupChannel,
    userParticipant,
    currentChatType,
    setCurrentChatType,
    setPage,
    setHasMoreMessages,
    setMessages,
    messagesRef,
    setIsSwitchingChatType,
    setIsLoadingMessages,
    setIsInitialLoad,
    handleMarkFailed,
    handleNewMessageRef,
    scrollToBottom,
    user,
    isLeavingChat,
    setIsLeavingChat,
    setShowLeaveConfirmation,
    setIsJoiningAsGuest,
    setIsMuted,
    setIsTogglingMute,
    isMuted,
  } = params;

  const leaveModalLabels = useMemo(() => {
    if (contextType !== 'GAME' || !userParticipant) {
      return { title: t('chat.leave'), message: t('chat.leaveConfirmation'), confirmText: t('chat.leave') };
    }
    if (userParticipant.status === 'GUEST') {
      return { title: t('chat.leave'), message: t('chat.leaveConfirmation'), confirmText: t('chat.leave') };
    }
    if (userParticipant.status === 'INVITED') {
      return { title: t('chat.leaveDeclineInviteTitle'), message: t('chat.leaveDeclineInviteMessage'), confirmText: t('common.decline') };
    }
    if (userParticipant.status === 'IN_QUEUE') {
      return { title: t('chat.leaveCancelQueueTitle'), message: t('chat.leaveCancelQueueMessage'), confirmText: t('games.cancelJoinRequest', { defaultValue: 'Cancel' }) };
    }
    return { title: t('chat.leave'), message: t('chat.leaveConfirmation'), confirmText: t('chat.leave') };
  }, [contextType, userParticipant, t]);

  const handleJoinAsGuest = useCallback(async () => {
    if (!id) return;
    if (contextType === 'GAME') {
      setIsJoiningAsGuest(true);
      try {
        await gamesApi.joinAsGuest(id);
        const updatedContext = await loadContext();
        if (updatedContext && contextType === 'GAME') {
          setGame(updatedContext as Game);
        }
      } catch (error) {
        console.error('Failed to join chat:', error);
      } finally {
        setIsJoiningAsGuest(false);
      }
    } else if (contextType === 'GROUP') {
      setIsJoiningAsGuest(true);
      try {
        await chatApi.joinGroupChannel(id);
        await loadContext();
      } catch (error) {
        console.error('Failed to join group/channel:', error);
      } finally {
        setIsJoiningAsGuest(false);
      }
    }
  }, [id, contextType, loadContext, setGame, setIsJoiningAsGuest]);

  const handleLeaveChat = useCallback(async () => {
    if (!id || isLeavingChat) return;
    setIsLeavingChat(true);
    try {
      if (contextType === 'GAME') {
        const isGuestOnly = userParticipant?.status === 'GUEST';
        if (isGuestOnly) {
          await gamesApi.leaveChat(id);
        } else {
          await gamesApi.leave(id);
        }
        navigate(-1);
      } else if (contextType === 'GROUP') {
        await chatApi.leaveGroupChannel(id);
        if (groupChannel?.marketItem) {
          navigate('/marketplace', { replace: true });
        } else if (groupChannel?.bug) {
          setChatsFilter('bugs');
          navigate('/bugs', { replace: true });
        } else {
          setChatsFilter('channels');
          navigate('/chats', { replace: true });
        }
      }
    } catch (error) {
      console.error('Failed to leave chat:', error);
    } finally {
      setIsLeavingChat(false);
      setShowLeaveConfirmation(false);
    }
  }, [id, contextType, navigate, userParticipant?.status, groupChannel, setChatsFilter, isLeavingChat, setIsLeavingChat, setShowLeaveConfirmation]);

  const handleToggleMute = useCallback(async () => {
    if (!id) return;
    setIsTogglingMute(true);
    try {
      if (isMuted) {
        await chatApi.unmuteChat(contextType, id);
        setIsMuted(false);
      } else {
        await chatApi.muteChat(contextType, id);
        setIsMuted(true);
      }
    } catch (error) {
      console.error('Failed to toggle mute:', error);
    } finally {
      setIsTogglingMute(false);
    }
  }, [id, contextType, isMuted, setIsTogglingMute, setIsMuted]);

  const handleJoinChannel = useCallback(() => {
    if (contextType === 'GROUP') {
      setGroupChannel((prev) => (prev ? { ...prev, isParticipant: true } : prev));
    }
  }, [contextType, setGroupChannel]);

  const handleChatTypeChange = useCallback(
    async (newChatType: ChatType) => {
      if (!id || newChatType === currentChatType || contextType === 'USER') return;
      setIsSwitchingChatType(true);
      setIsLoadingMessages(true);
      setCurrentChatType(newChatType);
      setPage(1);
      setHasMoreMessages(true);
      const normalizedChatType = normalizeChatType(newChatType);
      const requestId = id;

      const mergeForTab = (prev: ChatMessageWithStatus[], fresh: import('@/api/chat').ChatMessage[]) => {
        const pending =
          contextType === 'GAME'
            ? prev.filter(
                (m) =>
                  Boolean(m._optimisticId) &&
                  normalizeChatType((m as import('@/api/chat').ChatMessage).chatType as ChatType) ===
                    normalizedChatType
              )
            : prev.filter((m) => Boolean(m._optimisticId));
        return mergeChatMessagesAscending(pending, fresh);
      };

      const reconcileAfterLocal = () => {
        void reconcileChatThreadOpen({
          contextType,
          contextId: requestId,
          gameChatType: normalizedChatType,
          currentIdRef,
          messagesRef,
          setMessages,
          mergeLocalRefresh: mergeForTab,
        });
      };

      try {
        const { messages: local } = await loadLocalThreadBootstrap(contextType, id, normalizedChatType);
        if (local.length > 0) {
          setMessages((prev) => {
            const pending =
              contextType === 'GAME'
                ? prev.filter(
                    (m) =>
                      Boolean(m._optimisticId) &&
                      normalizeChatType((m as import('@/api/chat').ChatMessage).chatType as ChatType) ===
                        normalizedChatType
                  )
                : prev.filter((m) => Boolean(m._optimisticId));
            const merged = mergeChatMessagesAscending(pending, local);
            messagesRef.current = merged;
            return merged;
          });
          setHasMoreMessages(true);
          const last = local[local.length - 1];
          if (last) {
            useChatSyncStore
              .getState()
              .setLastMessageId(
                contextType,
                id,
                last.id,
                contextType === 'GAME' ? normalizedChatType : undefined
              );
          }
          reconcileAfterLocal();
        } else {
          const response = await chatApi.getMessages(contextType, id, 1, 50, normalizedChatType);
          void persistChatMessagesFromApi(response).catch(() => {});
          setMessages((prev) => {
            const merged = mergeServerPageWithPendingOptimistics(prev, response);
            messagesRef.current = merged;
            return merged;
          });
          setHasMoreMessages(response.length === 50);
          const tail = response[response.length - 1];
          if (tail) {
            useChatSyncStore
              .getState()
              .setLastMessageId(
                contextType,
                id,
                tail.id,
                contextType === 'GAME' ? normalizedChatType : undefined
              );
          }
          await reconcileChatThreadOpen({
            contextType,
            contextId: id!,
            gameChatType: normalizedChatType,
            currentIdRef,
            messagesRef,
            setMessages,
            mergeLocalRefresh: mergeForTab,
          });
        }
        if (user?.id) {
          await applyQueuedMessagesToState({
            contextType,
            contextId: id!,
            currentChatType: normalizedChatType,
            userId: user.id,
            user: user as import('@/types').BasicUser,
            messagesRef,
            setMessages,
            handleMarkFailed,
            onMessageCreated: (created) => handleNewMessageRef.current?.(created),
          });
        }
        scrollToBottom();
        if (id && user?.id && contextType === 'GAME') {
          applyOptimisticMarkGameRead(id);
          if (shouldQueueChatMutation()) {
            void enqueueChatMutationMarkReadBatch({
              contextType: 'GAME',
              contextId: id,
              payload: { target: 'context', chatTypes: [normalizedChatType] },
            });
          } else {
            chatApi.markAllMessagesAsRead(id, [normalizedChatType]).then((markReadResponse) => {
              const markedCount = markReadResponse.data.count || 0;
              const { setUnreadMessages, unreadMessages } = useHeaderStore.getState();
              setUnreadMessages(Math.max(0, unreadMessages - markedCount));
            }).catch(() => {});
          }
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        setIsSwitchingChatType(false);
        setIsLoadingMessages(false);
        setIsInitialLoad(false);
      }
    },
    [
      currentIdRef,
      currentChatType,
      contextType,
      id,
      user,
      scrollToBottom,
      handleMarkFailed,
      messagesRef,
      setMessages,
      setPage,
      setHasMoreMessages,
      setIsSwitchingChatType,
      setIsLoadingMessages,
      setIsInitialLoad,
      setCurrentChatType,
      handleNewMessageRef,
    ]
  );

  return {
    leaveModalLabels,
    handleJoinAsGuest,
    handleLeaveChat,
    handleToggleMute,
    handleJoinChannel,
    handleChatTypeChange,
  };
}
