import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { APP_UI_LANGUAGES } from '@bandeja/app-locale';
import en, { featureNamespaces as enNs } from './locales/en';
import ru, { featureNamespaces as ruNs } from './locales/ru';
import sr, { featureNamespaces as srNs } from './locales/sr';
import es, { featureNamespaces as esNs } from './locales/es';
import cs, { featureNamespaces as csNs } from './locales/cs';
import ar, { featureNamespaces as arNs } from './locales/ar';
import zh, { featureNamespaces as zhNs } from './locales/zh';
import id, { featureNamespaces as idNs } from './locales/id';
import hi, { featureNamespaces as hiNs } from './locales/hi';
import th, { featureNamespaces as thNs } from './locales/th';
import ja, { featureNamespaces as jaNs } from './locales/ja';
import { extractLanguageCode } from '@/utils/displayPreferences';
import { DEFAULT_NS, FEATURE_NAMESPACES, buildI18nResources } from './namespaces';

export { APP_UI_LANGUAGES };

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

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
  // Eager, bundled resources: owned namespaces (`./namespaces.ts`) sit beside the
  // flat default `translation` bundle, so no namespace ever loads asynchronously.
  resources: buildI18nResources({
    en: { translation: en, featureNamespaces: enNs },
    ru: { translation: ru, featureNamespaces: ruNs },
    sr: { translation: sr, featureNamespaces: srNs },
    es: { translation: es, featureNamespaces: esNs },
    cs: { translation: cs, featureNamespaces: csNs },
    ar: { translation: ar, featureNamespaces: arNs },
    zh: { translation: zh, featureNamespaces: zhNs },
    id: { translation: id, featureNamespaces: idNs },
    hi: { translation: hi, featureNamespaces: hiNs },
    th: { translation: th, featureNamespaces: thNs },
    ja: { translation: ja, featureNamespaces: jaNs },
  }),
  ns: [DEFAULT_NS, ...FEATURE_NAMESPACES],
  defaultNS: DEFAULT_NS,
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
