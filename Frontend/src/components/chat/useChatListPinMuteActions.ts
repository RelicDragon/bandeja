import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chatApi } from '@/api/chat';
import { MAX_PINNED_CHATS } from '@/utils/chatListConstants';
import { useUnreadStore } from '@/store/unreadStore';
import type { ChatInboxAdapter } from '@/services/chat/inbox/types';
import type { ChatsFilterType } from '@/components/chat/chatListFeedStore';
import toast from 'react-hot-toast';
import { AxiosError } from 'axios';

export function useChatListPinMuteActions(
  fetchChatsForFilter: (filter?: ChatsFilterType) => Promise<void>,
  adapter: ChatInboxAdapter,
  setMutedChats: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
) {
  const { t } = useTranslation();
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [togglingMuteId, setTogglingMuteId] = useState<string | null>(null);

  const handleMuteUserChat = useCallback(
    async (chatId: string, isMuted: boolean) => {
      setTogglingMuteId(chatId);
      try {
        if (isMuted) {
          await chatApi.unmuteChat('USER', chatId);
          setMutedChats((prev) => ({ ...prev, [chatId]: false }));
        } else {
          await chatApi.muteChat('USER', chatId);
          setMutedChats((prev) => ({ ...prev, [chatId]: true }));
        }
      } catch {
        toast.error(t('chat.muteFailed', { defaultValue: 'Failed to update mute' }));
      } finally {
        setTogglingMuteId(null);
      }
    },
    [setMutedChats, t]
  );

  const handleMuteGroupChannel = useCallback(
    async (channelId: string, isMuted: boolean) => {
      setTogglingMuteId(channelId);
      try {
        if (isMuted) {
          await chatApi.unmuteChat('GROUP', channelId);
          setMutedChats((prev) => ({ ...prev, [channelId]: false }));
          useUnreadStore.getState().toggleMutedGroupId(channelId, false);
        } else {
          await chatApi.muteChat('GROUP', channelId);
          setMutedChats((prev) => ({ ...prev, [channelId]: true }));
          useUnreadStore.getState().toggleMutedGroupId(channelId, true);
        }
      } catch {
        toast.error(t('chat.muteFailed', { defaultValue: 'Failed to update mute' }));
      } finally {
        setTogglingMuteId(null);
      }
    },
    [setMutedChats, t]
  );

  const handlePinUserChat = useCallback(
    async (chatId: string, isPinned: boolean) => {
      setPinningId(chatId);
      try {
        if (isPinned) await chatApi.unpinUserChat(chatId);
        else await chatApi.pinUserChat(chatId);
        adapter.invalidateUserChatsCache();
        adapter.invalidateFilterCache('users');
        await fetchChatsForFilter('users');
      } catch (e) {
        const msg = (e as AxiosError<{ message?: string }>)?.response?.data?.message;
        if (msg === 'MAX_PINNED_CHATS') {
          toast.error(t('chat.maxPinnedChatsReached', { max: MAX_PINNED_CHATS }));
        } else {
          toast.error(isPinned ? t('chat.unpinChatFailed') : t('chat.pinChatFailed'));
        }
      } finally {
        setPinningId(null);
      }
    },
    [adapter, fetchChatsForFilter, t]
  );

  const handlePinGroupChannel = useCallback(
    async (channelId: string, isPinned: boolean) => {
      setPinningId(channelId);
      try {
        if (isPinned) await chatApi.unpinGroupChannel(channelId);
        else await chatApi.pinGroupChannel(channelId);
        adapter.invalidateUserChatsCache();
        adapter.invalidateFilterCache('users');
        await fetchChatsForFilter('users');
      } catch (e) {
        const msg = (e as AxiosError<{ message?: string }>)?.response?.data?.message;
        if (msg === 'MAX_PINNED_CHATS') {
          toast.error(t('chat.maxPinnedChatsReached', { max: MAX_PINNED_CHATS }));
        } else {
          toast.error(isPinned ? t('chat.unpinChatFailed') : t('chat.pinChatFailed'));
        }
      } finally {
        setPinningId(null);
      }
    },
    [adapter, fetchChatsForFilter, t]
  );

  return {
    pinningId,
    togglingMuteId,
    handleMuteUserChat,
    handleMuteGroupChannel,
    handlePinUserChat,
    handlePinGroupChannel,
  };
}
