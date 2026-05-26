import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { chatApi } from '@/api/chat';
import { usePlayersStore } from '@/store/playersStore';
import { markReadAfterSend } from '@/services/chat/markReadAfterSend';
function isOfflineError(err: unknown): boolean {
  const e = err as { message?: string; code?: string };
  return e?.message === 'Network Error' || e?.code === 'ERR_NETWORK';
}

export function useStoryDmSend(recipientUserId: string) {
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
      setSending(true);
      try {
        const chatId = await resolveChatId();
        if (!chatId) {
          toast.error(t('stories.viewer.dmFailed'));
          return false;
        }
        await chatApi.createMessage({
          chatContextType: 'USER',
          contextId: chatId,
          content: trimmed,
          chatType: 'PUBLIC',
        });
        markReadAfterSend('USER', chatId);
        return true;
      } catch (err) {
        if (isOfflineError(err)) toast.error(t('stories.viewer.offline'));
        else toast.error(t('stories.viewer.dmFailed'));
        return false;
      } finally {
        setSending(false);
      }
    },
    [resolveChatId, sending, t]
  );

  return { sendDm, sending };
}
