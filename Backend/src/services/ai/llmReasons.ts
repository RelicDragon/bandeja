export const LLM_REASON = {
  MESSAGE_TRANSLATION: 'message_translation',
  TELEGRAM_RESULTS: 'telegram_results',
  VOICE_TRANSCRIPTION: 'voice_transcription',
} as const;

export type LlmReason = (typeof LLM_REASON)[keyof typeof LLM_REASON];
