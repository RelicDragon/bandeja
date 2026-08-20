import { describe, expect, it } from 'vitest';
import { BUG_CREATE_ERROR_FALLBACK_KEY } from './bugCreateErrorMessage';
import cs from '../../i18n/locales/cs/bug.json';
import en from '../../i18n/locales/en/bug.json';
import es from '../../i18n/locales/es/bug.json';
import ru from '../../i18n/locales/ru/bug.json';
import sr from '../../i18n/locales/sr/bug.json';

const locales = { cs, en, es, ru, sr };

describe('bug.createError i18n', () => {
  it('uses the fallback key bug.createError', () => {
    expect(BUG_CREATE_ERROR_FALLBACK_KEY).toBe('bug.createError');
  });

  it.each(Object.entries(locales))('%s has a non-empty bug.createError string', (_lang, json) => {
    expect(json.bug.createError.trim().length).toBeGreaterThan(0);
  });
});
