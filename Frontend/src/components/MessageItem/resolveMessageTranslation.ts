import type { ChatMessage } from '@/api/chat';
import type { User } from '@/types';
import { resolveIncomingTranslationTargetCode } from '@/utils/translationLanguages';

export function resolveMessageTranslation(
  message: Pick<ChatMessage, 'translation' | 'translations'>,
  user: Pick<User, 'language' | 'translateToLanguage'> | null | undefined
): ChatMessage['translation'] {
  const targetLanguageCode = resolveIncomingTranslationTargetCode(user);
  return (
    message.translations?.find(
      (translation) => translation.languageCode.toLowerCase() === targetLanguageCode
    ) ??
    (message.translation?.languageCode.toLowerCase() === targetLanguageCode
      ? message.translation
      : undefined)
  );
}
