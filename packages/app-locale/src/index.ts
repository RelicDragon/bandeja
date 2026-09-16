export {
  APP_UI_LANGUAGES,
  APP_UI_FALLBACK_LANGUAGE,
  APP_UI_LANGUAGE_META,
  extractAppUiLanguageCode,
  isAppUiLanguage,
  normalizeAppUiLanguage,
} from './appUiLanguages';
export type { AppUiLanguage, AppUiLanguageMeta } from './appUiLanguages';

/** Bumped when prompt/policy rules for game-text translation change. */
export const GAME_TEXT_TRANSLATION_POLICY_VERSION = 1;

/**
 * Package default when Backend env is unset.
 * Runtime: Backend `GAME_TEXT_LOCALIZATION_GENERATION_ENABLED` in config/env.ts.
 */
export const GAME_TEXT_LOCALIZATION_GENERATION_ENABLED = true;
