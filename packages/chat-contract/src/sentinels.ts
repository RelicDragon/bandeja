export const MESSAGE_TRANSLATION_PENDING = '__MESSAGE_TRANSLATION_PENDING__';

export const MESSAGE_TRANSCRIPTION_PENDING = '__MESSAGE_TRANSCRIPTION_PENDING__';

/** Stored verbatim when Whisper finds no speech; frontend maps to localized UI. */
export const MESSAGE_TRANSCRIPTION_NO_SPEECH = '__PP_TRANSCRIPTION_NO_SPEECH__';

export function isMessageTranslationPending(translation: string | null | undefined): boolean {
  return translation === MESSAGE_TRANSLATION_PENDING;
}
