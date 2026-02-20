export const LLM_REASON = {
  MESSAGE_TRANSLATION: 'message_translation',
  TELEGRAM_RESULTS: 'telegram_results',
} as const;

export type LlmReason = (typeof LLM_REASON)[keyof typeof LLM_REASON];
