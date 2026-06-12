import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { chatApi, type StoryReplyInfo } from '@/api/chat';
import { usePlayersStore } from '@/store/playersStore';
import { markReadAfterSend } from '@/services/chat/markReadAfterSend';
import { applyStoryDmSentMessage } from '@/services/chat/storyDmApply';

function isOfflineError(err: unknown): boolean {
  const e = err as { message?: string; code?: string };
  return e?.message === 'Network Error' || e?.code === 'ERR_NETWORK';
}

function storyDmErrorKind(err: unknown): 'offline' | 'expired' | 'forbidden' | 'failed' {
  if (isOfflineError(err)) return 'offline';
  const ax = err as { response?: { status?: number; data?: { message?: string; code?: string } } };
  const status = ax.response?.status;
  const message = ax.response?.data?.message ?? '';
  const code = ax.response?.data?.code ?? '';
  if (status === 404 || code === 'STORY_SEGMENT_NOT_FOUND' || /segment not found/i.test(message)) {
    return 'expired';
  }
  if (status === 403 || code === 'STORY_ENGAGEMENT_FORBIDDEN' || /forbidden/i.test(message)) {
    return 'forbidden';
  }
  return 'failed';
}

export function useStoryDmSend(recipientUserId: string, storyReply?: StoryReplyInfo | null) {
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const chatIdRef = useRef<string | null>(null);

  const resolveChatId = useCallback(async () => {
    if (chatIdRef.current) return chatIdRef.current;
    const chat = await usePlayersStore.getState().getOrCreateAndAddUserChat(recipientUserId);
    if (!chat?.id) return null;
    chatIdRef.current = chat.id;
    return chat.id;
  }, [recipientUserId]);

  const sendDm = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return false;
      if (!storyReply) {
        toast.error(t('stories.viewer.storyUnavailable', { defaultValue: 'Story is no longer available' }));
        return false;
      }
      setSending(true);
      try {
        const chatId = await resolveChatId();
        if (!chatId) {
          toast.error(t('stories.viewer.dmFailed'));
          return false;
        }
        const created = await chatApi.createMessage({
          chatContextType: 'USER',
          contextId: chatId,
          content: trimmed,
          chatType: 'PUBLIC',
          storyReply,
        });
        await applyStoryDmSentMessage(created);
        markReadAfterSend('USER', chatId);
        return true;
      } catch (err) {
        const kind = storyDmErrorKind(err);
        if (kind === 'offline') toast.error(t('stories.viewer.offline'));
        else if (kind === 'expired') {
          toast.error(t('stories.viewer.storyExpired', { defaultValue: 'This story is no longer available' }));
        } else if (kind === 'forbidden') {
          toast.error(t('stories.viewer.storyForbidden', { defaultValue: 'You cannot reply to this story' }));
        } else toast.error(t('stories.viewer.dmFailed'));
        return false;
      } finally {
        setSending(false);
      }
    },
    [resolveChatId, sending, storyReply, t]
  );

  return { sendDm, sending };
}
