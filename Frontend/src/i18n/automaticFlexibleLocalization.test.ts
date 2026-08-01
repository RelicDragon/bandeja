import { describe, expect, it } from 'vitest';
import cs from './locales/cs/gameDetails.json';
import en from './locales/en/gameDetails.json';
import es from './locales/es/gameDetails.json';
import ru from './locales/ru/gameDetails.json';
import sr from './locales/sr/gameDetails.json';

const keys = [
  'chooseDeciderFormat',
  'chooseAutomaticRecordMode',
  'chooseAutomaticContinue',
  'automaticRecordTitle',
  'automaticRecordSubtitle',
  'automaticRecordGamesCta',
  'automaticRecordAmericanoCta',
  'automaticContinueTitle',
  'automaticContinueSubtitle',
  'automaticContinueCta',
  'automaticEndCta',
  'automaticFinishSetCta',
  'chooseAutomaticFinishSet',
  'deciderTitle',
  'deciderSubtitle',
  'deciderRegularCta',
  'deciderAmericanoCta',
  'deciderSuperTbCta',
] as const;

type LiveScoringCopy = Record<(typeof keys)[number], string>;

const english = en.gameDetails.liveScoring as LiveScoringCopy;
const localized = {
  cs: cs.gameDetails.liveScoring as LiveScoringCopy,
  es: es.gameDetails.liveScoring as LiveScoringCopy,
  ru: ru.gameDetails.liveScoring as LiveScoringCopy,
  sr: sr.gameDetails.liveScoring as LiveScoringCopy,
};

describe('automatic flexible live-scoring localization', () => {
  for (const [locale, copy] of Object.entries(localized)) {
    it(`${locale} contains localized copy for every decision`, () => {
      for (const key of keys) {
        expect(copy[key], `${locale}.${key}`).toBeTruthy();
        expect(copy[key], `${locale}.${key}`).not.toBe(english[key]);
      }
    });
  }
});
