export const APP_STORE_URL = 'https://apps.apple.com/app/bandeja/id6756632318';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.funified.bandeja';

type StoreBadgeLang = 'en' | 'ru' | 'sr' | 'es' | 'cs' | 'ar' | 'zh' | 'id' | 'hi' | 'th' | 'ja';

const STORE_BADGES: Record<StoreBadgeLang, { ios: string; android: string }> = {
  en: {
    ios: 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83&releaseDate=1704067200',
    android: 'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png',
  },
  ru: {
    ios: 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/ru-ru?size=250x83&releaseDate=1704067200',
    android: 'https://play.google.com/intl/ru/badges/static/images/badges/ru_badge_web_generic.png',
  },
  sr: {
    ios: 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83&releaseDate=1704067200',
    android: 'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png',
  },
  es: {
    ios: 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/es-es?size=250x83&releaseDate=1704067200',
    android: 'https://play.google.com/intl/es/badges/static/images/badges/es_badge_web_generic.png',
  },
  cs: {
    ios: 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/cs-cz?size=250x83&releaseDate=1704067200',
    android: 'https://play.google.com/intl/cs/badges/static/images/badges/cs_badge_web_generic.png',
  },
  ar: {
    ios: 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/ar-sa?size=250x83&releaseDate=1704067200',
    android: 'https://play.google.com/intl/ar/badges/static/images/badges/ar_badge_web_generic.png',
  },
  zh: {
    ios: 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/zh-cn?size=250x83&releaseDate=1704067200',
    android: 'https://play.google.com/intl/zh-CN/badges/static/images/badges/zh-cn_badge_web_generic.png',
  },
  id: {
    ios: 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/id-id?size=250x83&releaseDate=1704067200',
    android: 'https://play.google.com/intl/id/badges/static/images/badges/id_badge_web_generic.png',
  },
  hi: {
    ios: 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/hi-in?size=250x83&releaseDate=1704067200',
    android: 'https://play.google.com/intl/hi/badges/static/images/badges/hi_badge_web_generic.png',
  },
  th: {
    ios: 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/th-th?size=250x83&releaseDate=1704067200',
    android: 'https://play.google.com/intl/th/badges/static/images/badges/th_badge_web_generic.png',
  },
  ja: {
    ios: 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/ja-jp?size=250x83&releaseDate=1704067200',
    android: 'https://play.google.com/intl/ja/badges/static/images/badges/ja_badge_web_generic.png',
  },
};

function resolveStoreBadgeLang(language: string): StoreBadgeLang {
  const code = language.split('-')[0].toLowerCase();
  if (code in STORE_BADGES) return code as StoreBadgeLang;
  return 'en';
}

export function getStoreBadgeUrls(language: string): { ios: string; android: string } {
  return STORE_BADGES[resolveStoreBadgeLang(language)];
}
