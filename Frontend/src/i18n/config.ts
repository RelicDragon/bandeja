import i18n, { type BackendModule, type ReadCallback } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { APP_UI_LANGUAGES } from '@bandeja/app-locale';
import en, { featureNamespaces as enNs } from './locales/en';
import { extractLanguageCode } from '@/utils/displayPreferences';
import { DEFAULT_NS, FEATURE_NAMESPACES, buildI18nResources, type FeatureNamespaceBundles } from './namespaces';

export { APP_UI_LANGUAGES };

// Only English (the fallback) ships in the entry bundle. Every other locale is its own
// chunk, fetched by this backend for the active language (and FAQ previews in another
// locale). All 11 locales eagerly bundled were ~5 MB of the startup JS.
type LocaleModule = { default: Record<string, unknown>; featureNamespaces: FeatureNamespaceBundles };
const LOCALE_LOADERS: Record<string, () => Promise<LocaleModule>> = {
  ru: () => import('./locales/ru'),
  sr: () => import('./locales/sr'),
  es: () => import('./locales/es'),
  cs: () => import('./locales/cs'),
  ar: () => import('./locales/ar'),
  zh: () => import('./locales/zh'),
  id: () => import('./locales/id'),
  hi: () => import('./locales/hi'),
  th: () => import('./locales/th'),
  ja: () => import('./locales/ja'),
};

const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language: string, namespace: string, callback: ReadCallback) {
    const load = LOCALE_LOADERS[language];
    if (!load) {
      callback(null, {});
      return;
    }
    load().then(
      (mod) => {
        const bundles = buildI18nResources({ [language]: { translation: mod.default, featureNamespaces: mod.featureNamespaces } })[language];
        callback(null, (bundles[namespace] ?? {}) as Parameters<ReadCallback>[1]);
      },
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), false),
    );
  },
};


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

export const i18nReady = i18n.use(lazyLocaleBackend).use(initReactI18next).init({
  // English is bundled; other locales load through `lazyLocaleBackend` before first
  // render (main.tsx awaits `i18nReady`) and on `changeLanguage`.
  resources: buildI18nResources({
    en: { translation: en, featureNamespaces: enNs },
  }),
  partialBundledLanguages: true,
  ns: [DEFAULT_NS, ...FEATURE_NAMESPACES],
  defaultNS: DEFAULT_NS,
  lng: getUserLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  pluralSeparator: '_',
  contextSeparator: '_',
  // Re-render when a lazily loaded locale arrives (e.g. FAQ preview via getFixedT).
  react: { bindI18n: 'languageChanged loaded' },
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
