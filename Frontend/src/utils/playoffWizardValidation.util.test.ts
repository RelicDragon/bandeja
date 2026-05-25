import { describe, expect, it } from 'vitest';
import {
  customByeErrorI18nKey,
  customPlayInErrorI18nKey,
  formatByeRangeForSummary,
  getCustomByeValidation,
  getCustomPlayInValidation,
} from './playoffWizardValidation.util';

describe('playoffWizardValidation.util (UX-B6, UX-B7)', () => {
  it('maps custom bye errors to i18n keys', () => {
    expect(customByeErrorI18nKey('countMismatch')).toBe('gameDetails.bracketCustomByesErrorCount');
    expect(customByeErrorI18nKey('duplicate')).toBe('gameDetails.bracketCustomByesErrorDuplicate');
  });

  it('maps custom play-in errors to i18n keys', () => {
    expect(customPlayInErrorI18nKey('DUPLICATE_SEED')).toBe(
      'gameDetails.bracketCustomPlayInErrorDuplicate'
    );
    expect(customPlayInErrorI18nKey('BYE_SEED_IN_PAIR')).toBe(
      'gameDetails.bracketCustomPlayInErrorByeSeed'
    );
  });

  it('validates custom byes inline', () => {
    expect(getCustomByeValidation(7, false, []).valid).toBe(true);
    expect(getCustomByeValidation(7, true, []).valid).toBe(false);
    expect(getCustomByeValidation(7, true, [1]).valid).toBe(true);
    expect(getCustomByeValidation(6, true, [1]).valid).toBe(false);
    expect(getCustomByeValidation(6, true, [1, 2]).valid).toBe(true);
  });

  it('validates custom play-in inline', () => {
    expect(getCustomPlayInValidation(7, false, []).valid).toBe(true);
    expect(getCustomPlayInValidation(7, true, [[3, 4], [5, 6], [7, 8]]).valid).toBe(false);
    expect(getCustomPlayInValidation(7, true, [[2, 3], [4, 5], [6, 7]]).valid).toBe(true);
  });

  it('formats custom bye ranges for structure summary', () => {
    expect(formatByeRangeForSummary([1])).toBe('#1');
    expect(formatByeRangeForSummary([1, 2, 3])).toBe('#1–#3');
    expect(formatByeRangeForSummary([1, 3, 5])).toBe('#1, #3, #5');
  });
});
