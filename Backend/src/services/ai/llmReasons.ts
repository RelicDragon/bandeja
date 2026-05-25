export const LLM_REASON = {
  MESSAGE_TRANSLATION: 'message_translation',
  TELEGRAM_RESULTS: 'telegram_results',
  RESULTS_ARTIFACTS: 'results_artifacts',
  VOICE_TRANSCRIPTION: 'voice_transcription',
} as const;

export type LlmReason = (typeof LLM_REASON)[keyof typeof LLM_REASON];
