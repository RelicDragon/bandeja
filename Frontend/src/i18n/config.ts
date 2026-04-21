import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ru from './locales/ru';
import sr from './locales/sr';
import es from './locales/es';
import cs from './locales/cs';
import { extractLanguageCode } from '@/utils/displayPreferences';

const getSystemLanguage = () => {
  const systemLang = navigator.language.split('-')[0];
  const supportedLanguages = ['en', 'ru', 'sr', 'es', 'cs'];
  return supportedLanguages.includes(systemLang) ? systemLang : 'en';
};

const getUserLanguage = (): string => {
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
  },
  lng: getUserLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  pluralSeparator: '_',
  contextSeparator: '_',
});

function applyHtmlLang(lng: string) {
  const code = lng ? extractLanguageCode(lng) : 'en';
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = code;
  }
}

i18n.on('languageChanged', (lng) => applyHtmlLang(lng));
applyHtmlLang(i18n.language);

export default i18n;

