import { isCapacitor } from './capacitor';
import i18n from '@/i18n/config';
import { extractLanguageCode } from '@/utils/displayPreferences';

const EULA_PATH = '/eula/world/eula.html';

const EULA_LANGS = new Set(['en', 'ru', 'sr', 'es', 'ar', 'zh', 'id', 'hi', 'th', 'ja']);

export const openEula = () => {
  const code = extractLanguageCode(i18n.language || 'en');
  const lang = EULA_LANGS.has(code) ? code : 'en';
  const qs = new URLSearchParams();
  qs.set('lang', lang);
  if (isCapacitor()) {
    qs.set('inapp', '1');
    window.location.href = `${EULA_PATH}?${qs.toString()}`;
  } else {
    window.open(`${EULA_PATH}?${qs.toString()}`, '_blank', 'noopener,noreferrer');
  }
};
