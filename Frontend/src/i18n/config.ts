import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ru from './locales/ru.json';
import sr from './locales/sr.json';
import es from './locales/es.json';

const getSystemLanguage = () => {
  const systemLang = navigator.language.split('-')[0];
  const supportedLanguages = ['en', 'ru', 'sr', 'es'];
  return supportedLanguages.includes(systemLang) ? systemLang : 'en';
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    sr: { translation: sr },
    es: { translation: es },
  },
  lng: localStorage.getItem('language') || getSystemLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  pluralSeparator: '_',
  contextSeparator: '_',
});

export default i18n;

