import {
  AD_CLICK_URL_LOCALE_PARAM,
  AD_CLICK_URL_THEME_PARAM,
  AD_CLICK_URL_USER_NAME_MAX_LEN,
  AD_CLICK_URL_USER_NAME_PARAM,
  appendClickUrlQueryParam,
  isPersonalizableClickUrl,
  normalizeAdClickLocale,
  normalizeAdClickTheme,
  personalizeClickUrl,
  resolveAdClickLocale,
  resolveAdClickTheme,
  resolveAdClickUserName,
} from './ad.clickUrl.util';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

{
  assert(resolveAdClickUserName('Alex', 'Petrov') === 'Alex Petrov', 'full name');
  assert(resolveAdClickUserName(null, null) === null, 'empty -> null');
  const long = 'A'.repeat(AD_CLICK_URL_USER_NAME_MAX_LEN + 20);
  assert(resolveAdClickUserName(long, null)?.length === AD_CLICK_URL_USER_NAME_MAX_LEN, 'name capped');
}

{
  assert(normalizeAdClickLocale('ru-RU') === 'ru', 'locale normalize');
  assert(normalizeAdClickLocale('EN') === 'en', 'locale lower');
  assert(normalizeAdClickLocale('sr_Latn') === 'sr', 'locale underscore');
  assert(normalizeAdClickLocale('rs') === 'sr', 'rs alias');
  assert(normalizeAdClickLocale('auto') === null, 'auto unresolved');
  assert(normalizeAdClickLocale('system') === null, 'system unresolved');
  assert(normalizeAdClickLocale('de') === null, 'unsupported null');

  assert(resolveAdClickLocale('auto', 'rs-RS') === 'sr', 'auto then rs');
  assert(resolveAdClickLocale('system', 'de-DE', 'ru') === 'ru', 'skip unsupported');
  assert(resolveAdClickLocale('auto', 'system', 'xx') === 'en', 'final en');

  assert(normalizeAdClickTheme('Dark') === 'dark', 'theme normalize');
  assert(normalizeAdClickTheme('system') === null, 'system theme needs hint');
  assert(normalizeAdClickTheme('system', { systemIsDark: true }) === 'dark', 'system dark');
  assert(normalizeAdClickTheme('auto', { systemIsDark: false }) === 'light', 'auto light');
  assert(resolveAdClickTheme('system', { systemIsDark: true }) === 'dark', 'resolve system');
  assert(resolveAdClickTheme('auto') === 'light', 'resolve auto default');
}

{
  assert(isPersonalizableClickUrl('https://x.test'), 'https ok');
  assert(isPersonalizableClickUrl('/promo'), 'path ok');
  assert(!isPersonalizableClickUrl('mailto:a@b.c'), 'mailto blocked');
  assert(!isPersonalizableClickUrl('//cdn.example'), 'protocol-relative blocked');
}

{
  const withQuery = appendClickUrlQueryParam(
    'https://bandeja.me/ad-test/',
    AD_CLICK_URL_USER_NAME_PARAM,
    'Alex Petrov',
  );
  assert(
    withQuery === 'https://bandeja.me/ad-test/?user_name=Alex+Petrov',
    `https append: ${withQuery}`,
  );
}

{
  const all = personalizeClickUrl(
    'https://x.test/',
    {
      appendUserNameToClickUrl: true,
      appendLocaleToClickUrl: true,
      appendThemeToClickUrl: true,
    },
    { userName: 'Alex', locale: 'rs', theme: 'system' },
    { systemIsDark: true },
  );
  assert(all.includes(`${AD_CLICK_URL_USER_NAME_PARAM}=Alex`), `name in ${all}`);
  assert(all.includes(`${AD_CLICK_URL_LOCALE_PARAM}=sr`), `locale rs→sr in ${all}`);
  assert(all.includes(`${AD_CLICK_URL_THEME_PARAM}=dark`), `theme system→dark in ${all}`);

  const fromAuto = personalizeClickUrl(
    'https://x.test/',
    {
      appendUserNameToClickUrl: false,
      appendLocaleToClickUrl: true,
      appendThemeToClickUrl: true,
    },
    { locale: 'auto', theme: 'auto' },
    { systemIsDark: false },
  );
  assert(fromAuto.includes('locale=en'), `auto locale→en: ${fromAuto}`);
  assert(fromAuto.includes('theme=light'), `auto theme→light: ${fromAuto}`);
}

console.log('ad.clickUrl.util: ok');
