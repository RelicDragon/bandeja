import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';
import { chatApi } from '@/api/chat';
import { TRANSLATE_DRAFT_MAX_LENGTH } from '@/components/chat/messageInputDraftUtils';

type Params = {
  message: string;
  mentionIds: string[];
  setMessage: (v: string) => void;
  setMentionIds: (v: string[]) => void;
  translateToLanguage: string | null;
  onTranslateToLanguageChange?: (translateToLanguage: string | null) => void | Promise<void>;
  updateMultilineState: () => void;
  t: TFunction;
};

export function useMessageInputTranslation({
  message,
  mentionIds,
  setMessage,
  setMentionIds,
  translateToLanguage,
  onTranslateToLanguageChange,
  updateMultilineState,
  t,
}: Params) {
  const [originalMessageBeforeTranslate, setOriginalMessageBeforeTranslate] = useState<string | null>(null);
  const [originalMentionIdsBeforeTranslate, setOriginalMentionIdsBeforeTranslate] = useState<string[] | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationModalOpen, setTranslationModalOpen] = useState(false);

  const clearTranslationOriginals = useCallback(() => {
    setOriginalMessageBeforeTranslate(null);
    setOriginalMentionIdsBeforeTranslate(null);
  }, []);

  const runTranslateDraft = useCallback(
    async (text: string, code: string, currentMentionIds: string[]) => {
      const result = await chatApi.translateDraft(text, code);
      setOriginalMessageBeforeTranslate(text);
      setOriginalMentionIdsBeforeTranslate(currentMentionIds.length ? [...currentMentionIds] : null);
      setMessage(result.translation);
      setMentionIds([]);
      setTimeout(() => updateMultilineState(), 100);
    },
    [setMessage, setMentionIds, updateMultilineState]
  );

  const handleTranslateLanguageSelect = useCallback(
    async (languageCode: string) => {
      const code = languageCode.toLowerCase();
      try {
        if (onTranslateToLanguageChange) {
          await onTranslateToLanguageChange(code);
        }
        setTranslationModalOpen(false);
        const trimmed = message.trim();
        if (trimmed) {
          if (trimmed.length > TRANSLATE_DRAFT_MAX_LENGTH) {
            toast.error(
              t('chat.translateTextTooLong', {
                defaultValue: 'Text is too long to translate.',
                max: TRANSLATE_DRAFT_MAX_LENGTH,
              })
            );
            return;
          }
          setIsTranslating(true);
          await new Promise((r) => setTimeout(r, 0));
          try {
            await runTranslateDraft(trimmed, code, mentionIds);
          } catch (err) {
            console.error('Translate draft failed:', err);
            const status = (err as { response?: { status?: number } })?.response?.status;
            toast.error(
              status === 429
                ? t('chat.translationRateLimited', {
                    defaultValue: 'Too many translation requests. Please try again in a few seconds.',
                  })
                : t('chat.translationUnavailable', { defaultValue: 'Translation is temporarily unavailable.' })
            );
          } finally {
            setIsTranslating(false);
          }
        }
      } catch (err) {
        console.error('Update translateToLanguage failed:', err);
        toast.error(t('chat.sendFailed') || 'Failed to save');
      }
    },
    [message, mentionIds, onTranslateToLanguageChange, runTranslateDraft, t]
  );

  const handleTranslateClick = useCallback(async () => {
    if (!translateToLanguage) return;
    const trimmed = message.trim();
    if (!trimmed) return;
    if (trimmed.length > TRANSLATE_DRAFT_MAX_LENGTH) {
      toast.error(
        t('chat.translateTextTooLong', {
          defaultValue: 'Text is too long to translate.',
          max: TRANSLATE_DRAFT_MAX_LENGTH,
        })
      );
      return;
    }
    setIsTranslating(true);
    await new Promise((r) => setTimeout(r, 0));
    try {
      await runTranslateDraft(trimmed, translateToLanguage, mentionIds);
    } catch (err) {
      console.error('Translate draft failed:', err);
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 429
          ? t('chat.translationRateLimited', {
              defaultValue: 'Too many translation requests. Please try again in a few seconds.',
            })
          : t('chat.translationUnavailable', { defaultValue: 'Translation is temporarily unavailable.' })
      );
    } finally {
      setIsTranslating(false);
    }
  }, [translateToLanguage, message, mentionIds, runTranslateDraft, t]);

  const handleTranslateButtonClick = useCallback(() => {
    if (translateToLanguage && !message.trim()) {
      setTranslationModalOpen(true);
    } else {
      void handleTranslateClick();
    }
  }, [translateToLanguage, message, handleTranslateClick]);

  const handleRemoveTranslateLanguage = useCallback(async () => {
    try {
      if (onTranslateToLanguageChange) {
        await onTranslateToLanguageChange(null);
      }
    } catch (err) {
      console.error('Clear translateToLanguage failed:', err);
      toast.error(t('chat.sendFailed') || 'Failed to save');
    }
  }, [onTranslateToLanguageChange, t]);

  const handleUndoTranslate = useCallback(() => {
    if (originalMessageBeforeTranslate != null) {
      setMessage(originalMessageBeforeTranslate);
      setMentionIds(originalMentionIdsBeforeTranslate ?? []);
      setOriginalMessageBeforeTranslate(null);
      setOriginalMentionIdsBeforeTranslate(null);
      setTimeout(() => updateMultilineState(), 100);
    }
  }, [originalMessageBeforeTranslate, originalMentionIdsBeforeTranslate, setMessage, setMentionIds, updateMultilineState]);

  return {
    originalMessageBeforeTranslate,
    isTranslating,
    translationModalOpen,
    setTranslationModalOpen,
    clearTranslationOriginals,
    setOriginalMessageBeforeTranslate,
    setOriginalMentionIdsBeforeTranslate,
    handleTranslateLanguageSelect,
    handleTranslateButtonClick,
    handleRemoveTranslateLanguage,
    handleUndoTranslate,
  };
}
