import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ru from './locales/ru';
import sr from './locales/sr';
import es from './locales/es';
import cs from './locales/cs';
import ar from './locales/ar';
import zh from './locales/zh';
import id from './locales/id';
import hi from './locales/hi';
import th from './locales/th';
import ja from './locales/ja';
import { extractLanguageCode } from '@/utils/displayPreferences';

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

export const APP_UI_LANGUAGES = ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'] as const;

const getSystemLanguage = () => {
  const systemLang = navigator.language.split('-')[0];
  return (APP_UI_LANGUAGES as readonly string[]).includes(systemLang) ? systemLang : 'en';
};

const getUserLanguage = (): string => {
  if (typeof localStorage === 'undefined') {
    return typeof navigator !== 'undefined' ? getSystemLanguage() : 'en';
  }

  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user?.language) {
        const langCode = extractLanguageCode(user.language);
        if (langCode) {
          return langCode;
        }
      }
    }
  } catch (error) {
    console.error('Error reading user language:', error);
  }
  
  const storedLang = localStorage.getItem('language');
  if (storedLang) {
    const langCode = extractLanguageCode(storedLang);
    if (langCode) {
      return langCode;
    }
  }
  
  return getSystemLanguage();
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    sr: { translation: sr },
    es: { translation: es },
    cs: { translation: cs },
    ar: { translation: ar },
    zh: { translation: zh },
    id: { translation: id },
    hi: { translation: hi },
    th: { translation: th },
    ja: { translation: ja },
  },
  lng: getUserLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  pluralSeparator: '_',
  contextSeparator: '_',
});

function applyHtmlLangDir(lng: string) {
  const code = lng ? extractLanguageCode(lng) : 'en';
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = code;
    document.documentElement.dir = RTL_LANGUAGES.has(code) ? 'rtl' : 'ltr';
  }
}

i18n.on('languageChanged', (lng) => applyHtmlLangDir(lng));
applyHtmlLangDir(i18n.language);

export default i18n;
