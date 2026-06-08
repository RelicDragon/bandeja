import type { ChatMessageWithStatus } from '@/api/chat';

export function mergeChatMessageTranslation(
  messages: ChatMessageWithStatus[],
  detail: {
    messageId: string;
    languageCode: string;
    translation?: string;
    removed?: boolean;
  },
  userLocale: string
): ChatMessageWithStatus[] {
  const idx = messages.findIndex((m) => m.id === detail.messageId);
  if (idx < 0) return messages;
  const m = messages[idx];
  const lc = detail.languageCode.toLowerCase();

  if (detail.removed) {
    const translations = (m.translations ?? []).filter((t) => t.languageCode.toLowerCase() !== lc);
    const next = [...messages];
    next[idx] = {
      ...m,
      translations,
      translation:
        m.translation?.languageCode.toLowerCase() === lc ? undefined : m.translation,
      _translationJustArrived: false,
    };
    return next;
  }

  if (detail.translation == null) return messages;

  const translations = [...(m.translations ?? [])];
  const tIdx = translations.findIndex((t) => t.languageCode.toLowerCase() === lc);
  const entry = { languageCode: detail.languageCode, translation: detail.translation };
  if (tIdx >= 0) translations[tIdx] = entry;
  else translations.push(entry);

  const next = [...messages];
  const patch: ChatMessageWithStatus = {
    ...m,
    translations,
    _translationJustArrived: lc === userLocale ? true : m._translationJustArrived,
  };
  if (lc === userLocale) {
    patch.translation = entry;
  }
  next[idx] = patch;
  return next;
}
