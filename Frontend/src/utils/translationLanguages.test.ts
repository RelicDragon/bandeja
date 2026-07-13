import { describe, expect, it } from 'vitest';
import {
  resolveAppLanguageTranslationTargetCode,
  resolveIncomingTranslationTargetCode,
} from './translationLanguages';

describe('resolveIncomingTranslationTargetCode', () => {
  it('uses explicit preferred language when set', () => {
    expect(
      resolveIncomingTranslationTargetCode({ translateToLanguage: 'es', language: 'en-GB' })
    ).toBe('es');
  });

  it('normalizes preferred language case', () => {
    expect(
      resolveIncomingTranslationTargetCode({ translateToLanguage: 'RU', language: 'en-GB' })
    ).toBe('ru');
  });

  it('falls back to app language locale when preferred is unset', () => {
    expect(
      resolveIncomingTranslationTargetCode({ translateToLanguage: null, language: 'ru-RU' })
    ).toBe('ru');
  });

  it('matches backend auto language fallback to English', () => {
    expect(
      resolveIncomingTranslationTargetCode({ translateToLanguage: null, language: 'auto' })
    ).toBe('en');
  });

  it('ignores invalid preferred language codes', () => {
    expect(
      resolveIncomingTranslationTargetCode({ translateToLanguage: 'xx', language: 'es-ES' })
    ).toBe('es');
  });
});

describe('resolveAppLanguageTranslationTargetCode', () => {
  it('derives from profile language only', () => {
    expect(resolveAppLanguageTranslationTargetCode({ language: 'cs-CZ' })).toBe('cs');
    expect(resolveAppLanguageTranslationTargetCode({ language: 'auto' })).toBe('en');
  });
});
