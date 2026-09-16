import { createInstance } from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { APP_UI_LANGUAGES } from '@bandeja/app-locale';
import ar from './locales/ar/games.json';
import cs from './locales/cs/games.json';
import en from './locales/en/games.json';
import es from './locales/es/games.json';
import hi from './locales/hi/games.json';
import id from './locales/id/games.json';
import ja from './locales/ja/games.json';
import ru from './locales/ru/games.json';
import sr from './locales/sr/games.json';
import th from './locales/th/games.json';
import zh from './locales/zh/games.json';

const resources = {
  ar: { translation: ar },
  cs: { translation: cs },
  en: { translation: en },
  es: { translation: es },
  hi: { translation: hi },
  id: { translation: id },
  ja: { translation: ja },
  ru: { translation: ru },
  sr: { translation: sr },
  th: { translation: th },
  zh: { translation: zh },
};

const i18n = createInstance();

beforeAll(async () => {
  await i18n.init({
    resources,
    lng: 'en',
    fallbackLng: false,
    interpolation: { escapeValue: false },
    pluralSeparator: '_',
  });
});

describe('games.participantsSpotsLeft', () => {
  it.each([...APP_UI_LANGUAGES])('%s interpolates Slavic-style _one counts (21, 31, 51)', (lng) => {
    for (const count of [1, 21, 31, 51]) {
      const text = i18n.t('games.participantsSpotsLeft', { lng, count });
      if (lng === 'ar' && count === 1) {
        expect(text, `${lng} count=${count}`).toMatch(/واحد/);
        continue;
      }
      expect(text, `${lng} count=${count}`).toContain(String(count));
    }
  });
});
