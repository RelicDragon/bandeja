import assert from 'assert';
import { resolveTranslationTargetLanguage } from './resolveTranslationTargetLanguage';

assert.equal(
  resolveTranslationTargetLanguage({
    language: 'en-GB',
    translateToLanguage: 'ru',
  }),
  'ru'
);
assert.equal(
  resolveTranslationTargetLanguage({
    language: 'sr-RS',
    translateToLanguage: null,
  }),
  'sr'
);
assert.equal(
  resolveTranslationTargetLanguage({
    language: 'es-ES',
    translateToLanguage: 'unsupported',
  }),
  'es'
);

console.log('resolveTranslationTargetLanguage tests passed');
