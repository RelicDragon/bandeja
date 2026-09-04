import { describe, expect, it } from 'vitest';
import ar from './locales/ar/playerCard.json';
import cs from './locales/cs/playerCard.json';
import en from './locales/en/playerCard.json';
import es from './locales/es/playerCard.json';
import hi from './locales/hi/playerCard.json';
import id from './locales/id/playerCard.json';
import ja from './locales/ja/playerCard.json';
import ru from './locales/ru/playerCard.json';
import sr from './locales/sr/playerCard.json';
import th from './locales/th/playerCard.json';
import zh from './locales/zh/playerCard.json';

const keys = [
  'button',
  'title',
  'intro',
  'deltaTitle',
  'deltaDescription',
  'matchesTitle',
  'matchesDescription',
  'leaderboardTitle',
  'leaderboardDescription',
  'example',
] as const;

type StreakInfoCopy = Record<(typeof keys)[number], string>;

const english = en.playerCard.streakInfo as StreakInfoCopy;
const localized = {
  ar: ar.playerCard.streakInfo,
  cs: cs.playerCard.streakInfo,
  es: es.playerCard.streakInfo,
  hi: hi.playerCard.streakInfo,
  id: id.playerCard.streakInfo,
  ja: ja.playerCard.streakInfo,
  ru: ru.playerCard.streakInfo,
  sr: sr.playerCard.streakInfo,
  th: th.playerCard.streakInfo,
  zh: zh.playerCard.streakInfo,
} satisfies Record<string, StreakInfoCopy>;

describe('streak result explanation localization', () => {
  it('states every classification boundary in English', () => {
    expect(english.deltaDescription).toContain('Zero or more = win');
    expect(english.deltaDescription).toContain('below zero = loss');
    expect(english.matchesDescription).toContain('Zero or more = win');
    expect(english.matchesDescription).toContain('below zero = loss');
    expect(english.matchesDescription).toContain('Winning one match is still a loss if you lost more');
    expect(english.matchesDescription).toContain('Playoff finals');
    expect(english.leaderboardDescription).toContain('top-half');
    expect(english.leaderboardDescription).toContain('middle spot');
    expect(english.example).toContain('4th out of 32');
  });

  for (const [locale, copy] of Object.entries(localized)) {
    it(`${locale} contains localized copy for every explanation`, () => {
      for (const key of keys) {
        expect(copy[key], `${locale}.${key}`).toBeTruthy();
        expect(copy[key], `${locale}.${key}`).not.toBe(english[key]);
      }
    });
  }
});
