export const MESSAGE_TRANSLATION_PENDING = '__MESSAGE_TRANSLATION_PENDING__';

export function isTranslationPending(translation: string | undefined | null): boolean {
  return translation === MESSAGE_TRANSLATION_PENDING;
}
