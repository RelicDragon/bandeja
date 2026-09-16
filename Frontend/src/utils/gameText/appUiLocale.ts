import { normalizeAppUiLanguage, type AppUiLanguage } from '@bandeja/app-locale';
import i18n from '@/i18n/config';

/** Current app UI locale for game-text read requests / cache keys. */
export function getAppUiLocaleForGameText(): AppUiLanguage {
  return normalizeAppUiLanguage(i18n.language);
}
