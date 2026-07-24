import { useCallback, useMemo } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { chatApi } from '@/api/chat';
import { gamesApi } from '@/api/games';
import { invitesApi } from '@/api/invites';
import { applyQueuedMessagesToState } from '@/services/applyQueuedMessagesToState';
import {
  applyThreadEvent,
  applyThreadL1Put,
  loadLocalThreadBootstrap,
  persistChatMessagesFromApi,
} from '@/services/chat/chatLocalApply';
import {
  getThreadOpenPaintGeneration,
  getThreadOpenScrollRow,
  reconcileAfterPaint,
} from '@/services/chat/threadOpen';
import { shouldPinAfterAsyncReconcile } from '@/components/MessageList/messageListOpenBottomIntent';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import { normalizeChatType } from '@/utils/chatType';
import { mergeServerPageWithPendingOptimistics } from '@/utils/chatMessageSort';
import { mergeChatTypeSwitchPaint, planChatTypeSwitch } from '@/services/chat/threadSession';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import type { Game } from '@/types';
import type { GroupChannel } from '@/api/chat';
import type { ChatMessageWithStatus } from '@/api/chat';
import type { RefObject } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useUnreadStore } from '@/store/unreadStore';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { isPendingGameInvite } from '@/utils/gameInviteParticipant';

export interface UseGameChatActionsParams {
  currentIdRef: RefObject<string | undefined>;
  id: string | undefined;
  contextType: ChatContextType;
  loadContext: (options?: import('./useGameChatContext').LoadContextOptions) => Promise<unknown>;
  navigate: NavigateFunction;
  setChatsFilter: (filter: 'users' | 'bugs' | 'channels' | 'market') => void;
  setGame: (game: Game | null | ((prev: Game | null) => Game | null)) => void;
  setGroupChannel: (ch: GroupChannel | null | ((prev: GroupChannel | null) => GroupChannel | null)) => void;
  groupChannel: GroupChannel | null;
  userParticipant: { id?: string; status?: string } | undefined;
  currentChatType: ChatType;
  setCurrentChatType: (t: ChatType) => void;
  setPage: (n: number) => void;
  setHasMoreMessages: (v: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  setIsSwitchingChatType: (v: boolean) => void;
  teardownForChatTypeSwitch: () => void;
  commitChatTypeSwitchPaint: (merged: ChatMessageWithStatus[], targetChatType: ChatType) => void;
  finishChatTypeSwitch: () => void;
  handleMarkFailed: (tempId: string) => void;
  handleNewMessageRef: React.MutableRefObject<(message: import('@/api/chat').ChatMessage) => string | void>;
  scrollToBottom: () => void;
  user: { id: string } | null;
  isLeavingChat: boolean;
  setIsLeavingChat: (v: boolean) => void;
  setShowLeaveConfirmation: (v: boolean) => void;
  setShowDeclineInviteModal: (v: boolean) => void;
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
    teardownForChatTypeSwitch,
    commitChatTypeSwitchPaint,
    finishChatTypeSwitch,
    handleMarkFailed,
    handleNewMessageRef,
    scrollToBottom,
    user,
    isLeavingChat,
    setIsLeavingChat,
    setShowLeaveConfirmation,
    setShowDeclineInviteModal,
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
    if (userParticipant.status === 'IN_QUEUE') {
      return { title: t('chat.leaveCancelQueueTitle'), message: t('chat.leaveCancelQueueMessage'), confirmText: t('games.cancelJoinRequest', { defaultValue: 'Cancel' }) };
    }
    return { title: t('chat.leave'), message: t('chat.leaveConfirmation'), confirmText: t('chat.leave') };
  }, [contextType, userParticipant, t]);

  const handleJoinAsGuest = useCallback(async () => {
    if (!id) return;
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleJoinAsGuest());
      return;
    }
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
        setGroupChannel((prev) => (prev ? { ...prev, isParticipant: true } : prev));
        await loadContext({ force: true });
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 400) {
          setGroupChannel((prev) => (prev ? { ...prev, isParticipant: true } : prev));
          await loadContext({ force: true });
        } else {
          console.error('Failed to join group/channel:', error);
        }
      } finally {
        setIsJoiningAsGuest(false);
      }
    }
  }, [id, contextType, loadContext, setGame, setGroupChannel, setIsJoiningAsGuest]);

  const handleLeaveClick = useCallback(() => {
    if (contextType === 'GAME' && userParticipant && isPendingGameInvite(userParticipant)) {
      setShowDeclineInviteModal(true);
      return;
    }
    setShowLeaveConfirmation(true);
  }, [contextType, userParticipant, setShowDeclineInviteModal, setShowLeaveConfirmation]);

  const handleDeclineInviteFromChat = useCallback(
    async (message?: string) => {
      if (!id || isLeavingChat) return;
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.nameIsSet !== true) {
        runWithProfileName(() => void handleDeclineInviteFromChat(message));
        return;
      }
      const participantId = userParticipant?.id;
      if (!participantId) return;
      setIsLeavingChat(true);
      try {
        await invitesApi.decline(participantId, message != null ? { message } : undefined);
        navigate(-1);
      } catch (error: unknown) {
        const errorMessage =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'errors.generic';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      } finally {
        setIsLeavingChat(false);
        setShowDeclineInviteModal(false);
      }
    },
    [
      id,
      isLeavingChat,
      userParticipant?.id,
      navigate,
      setIsLeavingChat,
      setShowDeclineInviteModal,
      t,
    ],
  );

  const handleLeaveChat = useCallback(async () => {
    if (!id || isLeavingChat) return;
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleLeaveChat());
      return;
    }
    setIsLeavingChat(true);
    try {
      if (contextType === 'GAME') {
        if (userParticipant && isPendingGameInvite(userParticipant)) {
          return;
        }
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
  }, [id, contextType, navigate, userParticipant, groupChannel, setChatsFilter, isLeavingChat, setIsLeavingChat, setShowLeaveConfirmation]);

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
      if (contextType === 'GROUP') {
        useUnreadStore.getState().toggleMutedGroupId(id, !isMuted);
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
      const switchPlan = planChatTypeSwitch({
        contextType,
        contextId: id,
        toChatType: newChatType,
      });
      const pendingBeforeTeardown = messagesRef.current;
      teardownForChatTypeSwitch();
      setIsSwitchingChatType(true);
      setCurrentChatType(newChatType);
      setPage(1);
      setHasMoreMessages(true);
      const normalizedChatType = normalizeChatType(newChatType);
      const requestId = id;

      const paintSwitch = (local: ChatMessageWithStatus[]) => {
        const merged = mergeChatTypeSwitchPaint(
          pendingBeforeTeardown,
          local,
          contextType,
          normalizedChatType
        );
        commitChatTypeSwitchPaint(merged, normalizedChatType);
        return merged;
      };

      const reconcileAfterLocal = () => {
        const threadKey = chatSyncTailKey(
          contextType,
          requestId,
          contextType === 'GAME' ? normalizedChatType : undefined
        );
        void reconcileAfterPaint({
          threadKey,
          paintGeneration: getThreadOpenPaintGeneration(threadKey),
          contextType,
          contextId: requestId,
          gameChatType: normalizedChatType,
          currentIdRef,
          messagesRef,
          setMessages,
          scrollRow: getThreadOpenScrollRow(),
        }).then((result) => {
          if (currentIdRef.current !== requestId) return;
          const scrollRow = getThreadOpenScrollRow();
          if (
            shouldPinAfterAsyncReconcile({
              reconcileWantsPin: result.pinToBottom,
              liveNearBottom: scrollRow?.atBottom === true,
              openScrollAtBottom: scrollRow?.atBottom,
            })
          ) {
            scrollToBottom();
          }
        });
      };

      try {
        const { messages: local } = await loadLocalThreadBootstrap(contextType, id, normalizedChatType);
        if (currentIdRef.current !== requestId) return;
        if (local.length > 0) {
          paintSwitch(local);
          const last = local[local.length - 1];
          if (last) {
            void applyThreadEvent({
              kind: 'uiTailAdvance',
              contextType,
              contextId: id,
              messageId: last.id,
              gameChatType: contextType === 'GAME' ? normalizedChatType : undefined,
            });
          }
          reconcileAfterLocal();
        } else {
          const response = await chatApi.getMessages(contextType, id, 1, 50, normalizedChatType);
          if (currentIdRef.current !== requestId) return;
          void persistChatMessagesFromApi(response).catch(() => {});
          const merged = mergeServerPageWithPendingOptimistics(
            mergeChatTypeSwitchPaint(pendingBeforeTeardown, [], contextType, normalizedChatType),
            response
          );
          commitChatTypeSwitchPaint(merged, normalizedChatType);
          setHasMoreMessages(response.length === 50);
          const tail = response[response.length - 1];
          if (tail) {
            void applyThreadEvent({
              kind: 'uiTailAdvance',
              contextType,
              contextId: id,
              messageId: tail.id,
              gameChatType: contextType === 'GAME' ? normalizedChatType : undefined,
            });
          }
          const threadKey = chatSyncTailKey(
            contextType,
            id!,
            contextType === 'GAME' ? normalizedChatType : undefined
          );
          const result = await reconcileAfterPaint({
            threadKey,
            paintGeneration: getThreadOpenPaintGeneration(threadKey),
            contextType,
            contextId: id!,
            gameChatType: normalizedChatType,
            currentIdRef,
            messagesRef,
            setMessages,
            scrollRow: getThreadOpenScrollRow(),
          });
          if (currentIdRef.current !== requestId) return;
          const scrollRow = getThreadOpenScrollRow();
          if (
            shouldPinAfterAsyncReconcile({
              reconcileWantsPin: result.pinToBottom,
              liveNearBottom: scrollRow?.atBottom === true,
              openScrollAtBottom: scrollRow?.atBottom,
            })
          ) {
            scrollToBottom();
          }
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
        if (contextType === 'GAME' && id && switchPlan.nextThreadKey) {
          useGameDetailsChromeStore.getState().setViewingGameChat(id, normalizedChatType);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        if (id && currentIdRef.current === id) {
          void applyThreadL1Put({
            contextType,
            contextId: id,
            gameChatType: contextType === 'GAME' ? normalizedChatType : undefined,
            readRows: () => messagesRef.current,
            verify: () => currentIdRef.current === id,
            immediate: true,
          });
        }
        finishChatTypeSwitch();
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
      setCurrentChatType,
      handleNewMessageRef,
      teardownForChatTypeSwitch,
      commitChatTypeSwitchPaint,
      finishChatTypeSwitch,
    ]
  );

  return {
    leaveModalLabels,
    handleLeaveClick,
    handleJoinAsGuest,
    handleLeaveChat,
    handleDeclineInviteFromChat,
    handleToggleMute,
    handleJoinChannel,
    handleChatTypeChange,
  };
}
