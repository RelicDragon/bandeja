export const LLM_REASON = {
  MESSAGE_TRANSLATION: 'message_translation',
  GAME_TEXT_TRANSLATION: 'game_text_translation',
  FAQ_TRANSLATION: 'faq_translation',
  TELEGRAM_RESULTS: 'telegram_results',
  RESULTS_ARTIFACTS: 'results_artifacts',
  VOICE_TRANSCRIPTION: 'voice_transcription',
  APP_RELEASE_NOTES: 'app_release_notes',
  RATING_EXPLANATION: 'rating_explanation',
  RATING_EXPLANATION_TRANSLATION: 'rating_explanation_translation',
  AGENT_CHAT: 'agent_chat',
  /** Phase 11.4 rolling chat summary (one call when enough turns fold out of the window). */
  AGENT_CHAT_SUMMARY: 'agent_chat_summary',
  /** Phase 11.4 weekly memory consolidation (one call per user, global daily cap). */
  AGENT_MEMORY_CONSOLIDATION: 'agent_memory_consolidation',
  /** Agent web tools: audit + budget rows (no LLM call; `inputTokens` = token-equivalent charge). */
  AGENT_WEB_SEARCH: 'agent_web_search',
  AGENT_WEB_FETCH: 'agent_web_fetch',
  /** Agent voice (dictation / conversation): audit + budget rows; `inputTokens` = token-equivalent charge. */
  AGENT_VOICE_TRANSCRIPTION: 'agent_voice_transcription',
  AGENT_VOICE_SPEECH: 'agent_voice_speech',
} as const;

export type LlmReason = (typeof LLM_REASON)[keyof typeof LLM_REASON];
