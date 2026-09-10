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

const locales = { ar, cs, en, es, hi, id, ja, ru, sr, th, zh } as const;

type PlayerCardCopy = {
  playerCard: Record<string, unknown>;
};

describe('playerCard tabs localization', () => {
  for (const [name, locale] of Object.entries(locales)) {
    it(`${name} has chart + profileTabs labels and no stale levels key`, () => {
      const copy = (locale as unknown as PlayerCardCopy).playerCard;
      expect(typeof copy.chart, `${name}.playerCard.chart`).toBe('string');
      expect((copy.chart as string).trim().length).toBeGreaterThan(0);
      expect(typeof copy.profileTabs, `${name}.playerCard.profileTabs`).toBe('string');
      expect((copy.profileTabs as string).trim().length).toBeGreaterThan(0);
      expect(typeof copy.statistics, `${name}.playerCard.statistics`).toBe('string');
      expect((copy.statistics as string).trim().length).toBeGreaterThan(0);
      expect(typeof copy.groups, `${name}.playerCard.groups`).toBe('string');
      expect((copy.groups as string).trim().length).toBeGreaterThan(0);
      expect('levels' in copy, `${name}.playerCard.levels`).toBe(false);
    });
  }

  it('en values', () => {
    expect(en.playerCard.chart).toBe('Chart');
    expect(en.playerCard.profileTabs).toBe('Profile tabs');
    expect(en.playerCard.statistics).toBe('Statistics');
    expect(en.playerCard.groups).toBe('Groups');
  });
});
