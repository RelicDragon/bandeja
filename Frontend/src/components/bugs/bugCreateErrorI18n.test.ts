import { describe, expect, it } from 'vitest';
import {
  BUG_CREATE_ERROR_FALLBACK_KEY,
  BUG_CREATE_NETWORK_ERROR_KEY,
} from './bugCreateErrorMessage';
import csBug from '../../i18n/locales/cs/bug.json';
import enBug from '../../i18n/locales/en/bug.json';
import esBug from '../../i18n/locales/es/bug.json';
import ruBug from '../../i18n/locales/ru/bug.json';
import srBug from '../../i18n/locales/sr/bug.json';
import csErrors from '../../i18n/locales/cs/errors.json';
import enErrors from '../../i18n/locales/en/errors.json';
import esErrors from '../../i18n/locales/es/errors.json';
import ruErrors from '../../i18n/locales/ru/errors.json';
import srErrors from '../../i18n/locales/sr/errors.json';

const bugLocales = { cs: csBug, en: enBug, es: esBug, ru: ruBug, sr: srBug };
const errorLocales = { cs: csErrors, en: enErrors, es: esErrors, ru: ruErrors, sr: srErrors };

const SERVER_BUG_CREATE_KEYS = ['errors.bugs.textRequired', 'errors.bugs.typeRequired'] as const;

function nestedString(root: unknown, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (typeof acc !== 'object' || acc === null) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, root);
  return typeof value === 'string' ? value : undefined;
}

describe('bug create error i18n', () => {
  it('uses stable translation keys', () => {
    expect(BUG_CREATE_ERROR_FALLBACK_KEY).toBe('bug.createError');
    expect(BUG_CREATE_NETWORK_ERROR_KEY).toBe('errors.networkError');
  });

  it.each(Object.entries(bugLocales))('%s has a non-empty bug.createError string', (_lang, json) => {
    expect(json.bug.createError.trim().length).toBeGreaterThan(0);
  });

  it.each(Object.entries(errorLocales))('%s has a non-empty errors.networkError string', (_lang, json) => {
    expect(json.errors.networkError.trim().length).toBeGreaterThan(0);
  });

  it.each(Object.entries(errorLocales))('%s translates backend bug-create error keys', (_lang, json) => {
    for (const key of SERVER_BUG_CREATE_KEYS) {
      const value = nestedString(json, key);
      expect(value?.trim().length).toBeGreaterThan(0);
    }
  });
});
