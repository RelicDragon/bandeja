import assert from 'node:assert/strict';
import {
  emptyExplanationBlob,
  normalizeSourceLanguage,
  normalizeTranslationLanguage,
  readExplanationBlob,
  updateExplanationBlob,
  writeExplanationBlob,
} from '../../src/services/results/ratingExplanationLlmStorage';

function testNormalizeLanguage() {
  assert.equal(normalizeSourceLanguage('ru-RU'), 'ru');
  assert.equal(normalizeSourceLanguage('pt-BR'), 'en');
  assert.equal(normalizeTranslationLanguage('fr'), 'fr');
  assert.equal(normalizeTranslationLanguage('xx'), 'en');
}

function testLegacyAndV2() {
  const legacy = readExplanationBlob({
    llmRatingExplanation: {
      status: 'ready',
      language: 'en',
      text: 'Hello',
      startedAt: '2026-01-01T00:00:00.000Z',
    },
  });
  assert.equal(legacy?.version, 2);
  assert.equal(legacy?.source.text, 'Hello');

  const map = readExplanationBlob({
    llmRatingExplanation: {
      en: { status: 'pending', language: 'en', startedAt: '2026-01-01T00:00:00.000Z' },
      ru: {
        status: 'ready',
        language: 'ru',
        text: 'RU',
        startedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  });
  assert.equal(map?.source.language, 'ru');
}

async function testConcurrentMerge() {
  let stored: Record<string, unknown> = {
    llmRatingExplanation: {
      version: 2,
      source: {
        status: 'ready',
        language: 'en',
        text: 'EN',
        startedAt: '2026-01-01T00:00:00.000Z',
      },
      translations: {},
    },
  };

  const load = async () => ({ id: '1', metadata: stored as never });
  const persist = async (_id: string, metadata: unknown) => {
    stored = metadata as Record<string, unknown>;
  };

  // Simulate interleaving: both start from empty translations
  const first = updateExplanationBlob(load, persist, (current) => {
    assert.ok(current);
    return {
      ...current!,
      translations: {
        ...current!.translations,
        ru: { status: 'pending', language: 'ru', startedAt: 't1' },
      },
    };
  });

  const second = updateExplanationBlob(load, persist, (current) => {
    assert.ok(current);
    return {
      ...current!,
      translations: {
        ...current!.translations,
        fr: { status: 'pending', language: 'fr', startedAt: 't2' },
      },
    };
  });

  await Promise.all([first, second]);
  const blob = readExplanationBlob(stored as never);
  assert.ok(blob?.translations.ru);
  assert.ok(blob?.translations.fr);
  assert.equal(blob?.source.text, 'EN');
}

function testWriteRoundTrip() {
  const blob = emptyExplanationBlob({
    status: 'ready',
    language: 'en',
    text: 'Hi',
    startedAt: '2026-01-01T00:00:00.000Z',
  });
  blob.translations.es = {
    status: 'ready',
    language: 'es',
    text: 'Hola',
    startedAt: '2026-01-01T00:00:01.000Z',
  };
  const written = writeExplanationBlob({}, blob);
  const read = readExplanationBlob(written);
  assert.equal(read?.source.text, 'Hi');
  assert.equal(read?.translations.es?.text, 'Hola');
}

testNormalizeLanguage();
testLegacyAndV2();
testWriteRoundTrip();
void testConcurrentMerge().then(() => {
  console.log('ratingExplanationLlmStorage tests passed');
});
