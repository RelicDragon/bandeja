import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { NavigateFunction } from 'react-router-dom';
import toast from 'react-hot-toast';
import { chatApi, type ChatMessage, type ChatMessageWithStatus, type ChatContextType, type GroupChannel, type UserChat } from '@/api/chat';
import { formatChatMessageForForwardClipboard } from '@/utils/chatForwardClipboard';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import type { ChatType, Game, User } from '@/types';
import type { RefObject } from 'react';
import { useGameChatDisplay } from './useGameChatDisplay';
import { useGameChatPanels } from './useGameChatPanels';
import { useGameChatActions } from './useGameChatActions';
import { useGameChatMutationRetry } from './useGameChatMutationRetry';
import type { useThreadDerived } from '@/services/chat/chatThreadController/useThreadDerived';
import type { LoadContextOptions } from './useGameChatContext';

export interface UseThreadViewChromeParams {
  id: string | undefined;
  contextType: ChatContextType;
  currentChatType: ChatType;
  game: Game | null;
  bug: import('@/types').Bug | null;
  userChat: UserChat | null;
  groupChannel: GroupChannel | null;
  groupChannelParticipantsCount: number;
  user: User | null;
  navigate: NavigateFunction;
  setChatsFilter: (filter: 'users' | 'bugs' | 'channels' | 'market') => void;
  loadContext: (options?: LoadContextOptions) => Promise<unknown>;
  setGame: (game: Game | null | ((prev: Game | null) => Game | null)) => void;
  setGroupChannel: (ch: GroupChannel | null | ((prev: GroupChannel | null) => GroupChannel | null)) => void;
  derived: ReturnType<typeof useThreadDerived>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  setPage: (n: number) => void;
  setHasMoreMessages: (v: boolean) => void;
  setIsSwitchingChatType: (v: boolean) => void;
  teardownForChatTypeSwitch: () => void;
  commitChatTypeSwitchPaint: (merged: ChatMessageWithStatus[], targetChatType: ChatType) => void;
  handleMarkFailed: (tempId: string) => void;
  handleNewMessageRef: React.MutableRefObject<(message: ChatMessage) => string | void>;
  scrollToBottom: () => void;
  currentIdRef: RefObject<string | undefined>;
  isLeavingChat: boolean;
  setIsLeavingChat: (v: boolean) => void;
  showLeaveConfirmation: boolean;
  setShowLeaveConfirmation: (v: boolean) => void;
  showDeclineInviteModal: boolean;
  setShowDeclineInviteModal: (v: boolean) => void;
  isJoiningAsGuest: boolean;
  setIsJoiningAsGuest: (v: boolean) => void;
  isMuted: boolean;
  setIsMuted: (v: boolean) => void;
  isTogglingMute: boolean;
  setIsTogglingMute: (v: boolean) => void;
  setCurrentChatType: (t: ChatType) => void;
  markRead: () => void;
}

export function useThreadViewChrome(params: UseThreadViewChromeParams) {
  const {
    id,
    contextType,
    currentChatType,
    game,
    bug,
    userChat,
    groupChannel,
    groupChannelParticipantsCount,
    user,
    navigate,
    setChatsFilter,
    loadContext,
    setGame,
    setGroupChannel,
    derived,
    setMessages,
    messagesRef,
    setPage,
    setHasMoreMessages,
    setIsSwitchingChatType,
    teardownForChatTypeSwitch,
    commitChatTypeSwitchPaint,
    handleMarkFailed,
    handleNewMessageRef,
    scrollToBottom,
    currentIdRef,
    isLeavingChat,
    setIsLeavingChat,
    showLeaveConfirmation,
    setShowLeaveConfirmation,
    showDeclineInviteModal,
    setShowDeclineInviteModal,
    isJoiningAsGuest,
    setIsJoiningAsGuest,
    isMuted,
    setIsMuted,
    isTogglingMute,
    setIsTogglingMute,
    setCurrentChatType,
    markRead,
  } = params;

  const { t } = useTranslation();

  const panels = useGameChatPanels({
    contextType,
    userChat,
    userId: user?.id,
    isItemChat: derived.isItemChat,
    navigate,
  });

  const displaySettings = user ? resolveDisplaySettings(user) : resolveDisplaySettings(null);
  const { title, titleContent, titleMetaRow, subtitle: baseSubtitle, icon } = useGameChatDisplay({
    contextType,
    game,
    bug,
    userChat,
    groupChannel,
    groupChannelParticipantsCount,
    isBugChat: derived.isBugChat,
    isItemChat: derived.isItemChat,
    userId: user?.id,
    displaySettings,
    onOpenItemPage: panels.onOpenItemPage,
    onOpenParticipantsPage: panels.onOpenParticipantsPage,
  });

  const { failedMutationCount, retryMutations } = useGameChatMutationRetry(contextType, id);

  const {
    leaveModalLabels,
    handleLeaveClick,
    handleJoinAsGuest,
    handleLeaveChat,
    handleDeclineInviteFromChat,
    handleToggleMute,
    handleJoinChannel,
    handleChatTypeChange,
  } = useGameChatActions({
    currentIdRef,
    id,
    contextType,
    loadContext,
    navigate,
    setChatsFilter,
    setGame,
    setGroupChannel,
    groupChannel,
    userParticipant: derived.userParticipant,
    currentChatType,
    setCurrentChatType,
    setPage,
    setHasMoreMessages,
    setMessages,
    messagesRef,
    setIsSwitchingChatType,
    teardownForChatTypeSwitch,
    commitChatTypeSwitchPaint,
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
  });

  const handleForwardMessage = useCallback(
    async (m: ChatMessage) => {
      const text = formatChatMessageForForwardClipboard(m);
      if (!text.trim()) return;
      try {
        if (typeof navigator.share === 'function') {
          try {
            await navigator.share({ text });
            return;
          } catch (shareErr: unknown) {
            if ((shareErr as { name?: string })?.name === 'AbortError') return;
          }
        }
        await navigator.clipboard.writeText(text);
        toast.success(t('chat.forwardCopied', { defaultValue: 'Copied — paste in another chat' }));
      } catch {
        toast.error(t('chat.forwardFailed', { defaultValue: 'Could not forward' }));
      }
    },
    [t]
  );

  const handleMessageSent = useCallback(() => {
    markRead();
  }, [markRead]);

  const handleTranslateToLanguageChange = useCallback(
    async (value: string | null) => {
      if (!id) return;
      await chatApi.setChatTranslationPreference(contextType, id, value);
    },
    [id, contextType]
  );

  const handleGroupChannelUpdate = useMemo(
    () => (contextType === 'GROUP' ? () => { void loadContext({ force: true }); } : undefined),
    [contextType, loadContext]
  );

  return {
    panels,
    title,
    titleContent,
    titleMetaRow,
    subtitle: baseSubtitle ?? null,
    icon,
    failedMutationCount,
    retryMutations,
    leaveModalLabels,
    handleLeaveClick,
    handleJoinAsGuest,
    handleLeaveChat,
    handleDeclineInviteFromChat,
    handleToggleMute,
    handleJoinChannel,
    handleChatTypeChange,
    handleForwardMessage,
    handleMessageSent,
    handleTranslateToLanguageChange,
    handleGroupChannelUpdate,
    isLeavingChat,
    showLeaveConfirmation,
    setShowLeaveConfirmation,
    showDeclineInviteModal,
    setShowDeclineInviteModal,
    isJoiningAsGuest,
    isMuted,
    isTogglingMute,
  };
}
