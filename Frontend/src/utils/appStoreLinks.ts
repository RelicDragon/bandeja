export const APP_STORE_URL = 'https://apps.apple.com/app/bandeja/id6756632318';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.funified.bandeja';

type StoreBadgeLang = 'en' | 'ru' | 'sr' | 'es' | 'cs';

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
};

function resolveStoreBadgeLang(language: string): StoreBadgeLang {
  const code = language.split('-')[0].toLowerCase();
  if (code in STORE_BADGES) return code as StoreBadgeLang;
  return 'en';
}

export function getStoreBadgeUrls(language: string): { ios: string; android: string } {
  return STORE_BADGES[resolveStoreBadgeLang(language)];
}
