import { useEffect } from 'react';
import type { ChatContextType, ChatMessageWithStatus } from '@/api/chat';
import type { ChatType } from '@/types';
import { extractLanguageCode } from '@/utils/language';
import { isTranslationPending } from '@/constants/messageTranslationPending';
import { chatAutoTranslateTypeKey } from '@/utils/chatAutoTranslateTypeKey';
import {
  patchMessageTranslationInDexie,
  removeMessageTranslationInDexie,
} from '@/services/chat/chatLocalApply';
import { mergeChatMessageTranslation } from './mergeChatMessageTranslation';

export interface UseGameChatTranslationLiveParams {
  id: string | undefined;
  contextType: ChatContextType;
  effectiveChatType: ChatType;
  userLanguage: string | null | undefined;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  onAutoTranslateConfigFromSocket?: (languageCodes: string[], chatTypeKey: string) => void;
}

export function useGameChatTranslationLive({
  id,
  contextType,
  effectiveChatType,
  userLanguage,
  setMessages,
  messagesRef,
  onAutoTranslateConfigFromSocket,
}: UseGameChatTranslationLiveParams) {
  const userLocale = extractLanguageCode(userLanguage).toLowerCase();
  const expectedTypeKey = chatAutoTranslateTypeKey(contextType, effectiveChatType);

  useEffect(() => {
    const onTranslation = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        contextType?: string;
        contextId?: string;
        messageId?: string;
        languageCode?: string;
        translation?: string;
        removed?: boolean;
      };
      if (detail.contextId !== id || detail.contextType !== contextType) return;
      if (!detail.messageId || !detail.languageCode) return;

      if (detail.removed) {
        void removeMessageTranslationInDexie(detail.messageId, detail.languageCode).catch(() => {});
      } else {
        if (detail.translation == null) return;
        if (isTranslationPending(detail.translation)) return;
        void patchMessageTranslationInDexie(
          detail.messageId,
          detail.languageCode,
          detail.translation
        ).catch(() => {});
      }

      setMessages((prev) => {
        const next = mergeChatMessageTranslation(
          prev,
          {
            messageId: detail.messageId!,
            languageCode: detail.languageCode!,
            translation: detail.translation,
            removed: detail.removed,
          },
          userLocale
        );
        messagesRef.current = next;
        return next;
      });
    };

    const onConfig = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        contextType?: string;
        contextId?: string;
        languageCodes?: string[];
        chatTypeKey?: string;
      };
      if (detail.contextId !== id || detail.contextType !== contextType) return;
      if (detail.chatTypeKey != null && detail.chatTypeKey !== expectedTypeKey) return;
      if (detail.languageCodes && onAutoTranslateConfigFromSocket) {
        onAutoTranslateConfigFromSocket(detail.languageCodes, detail.chatTypeKey ?? '');
      }
    };

    window.addEventListener('chat:message-translation', onTranslation);
    window.addEventListener('chat:auto-translate-config', onConfig);
    return () => {
      window.removeEventListener('chat:message-translation', onTranslation);
      window.removeEventListener('chat:auto-translate-config', onConfig);
    };
  }, [
    id,
    contextType,
    userLocale,
    expectedTypeKey,
    setMessages,
    messagesRef,
    onAutoTranslateConfigFromSocket,
  ]);
}
