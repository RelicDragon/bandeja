import { describe, expect, it } from 'vitest';
import { resolveDisplayedGameText } from './resolveDisplayedGameText';
import type { GameLocalizedTextProjection } from './gameLocalizedText.types';

function projection(
  overrides: {
    locale?: GameLocalizedTextProjection['locale'];
    name?: Partial<GameLocalizedTextProjection['name']>;
    description?: Partial<GameLocalizedTextProjection['description']>;
  } = {},
): GameLocalizedTextProjection {
  return {
    locale: overrides.locale ?? 'ru',
    name: {
      text: 'Воскресный',
      sourceRevision: 1,
      state: 'ready',
      provenance: 'automatic',
      ...overrides.name,
    },
    description: {
      text: 'Принесите мячи',
      sourceRevision: 1,
      state: 'ready',
      provenance: 'automatic',
      ...overrides.description,
    },
  };
}

describe('resolveDisplayedGameText', () => {
  it('uses localized projection when locale matches', () => {
    const result = resolveDisplayedGameText(
      {
        name: 'Sunday',
        description: 'Bring balls',
        localizedText: projection(),
      },
      { locale: 'ru' },
    );
    expect(result.name).toBe('Воскресный');
    expect(result.description).toBe('Принесите мячи');
    expect(result.isTranslated).toBe(true);
  });

  it('falls back to originals when showOriginal', () => {
    const result = resolveDisplayedGameText(
      {
        name: 'Sunday',
        description: 'Bring balls',
        localizedText: projection(),
      },
      { locale: 'ru', showOriginal: true },
    );
    expect(result.name).toBe('Sunday');
    expect(result.description).toBe('Bring balls');
    expect(result.showOriginal).toBe(true);
  });

  it('falls back to originals when projection locale mismatches', () => {
    const result = resolveDisplayedGameText(
      {
        name: 'Sunday',
        description: 'Bring balls',
        localizedText: projection({ locale: 'ru' }),
      },
      { locale: 'es' },
    );
    expect(result.name).toBe('Sunday');
    expect(result.description).toBe('Bring balls');
  });

  it('pending projection still returns original text from field', () => {
    const result = resolveDisplayedGameText(
      {
        name: 'Sunday',
        description: null,
        localizedText: projection({
          name: {
            text: 'Sunday',
            state: 'pending',
            provenance: 'original',
            sourceRevision: 0,
          },
          description: {
            text: null,
            state: 'not_needed',
            provenance: 'empty_source',
            sourceRevision: 0,
          },
        }),
      },
      { locale: 'ru' },
    );
    expect(result.name).toBe('Sunday');
    expect(result.isTranslated).toBe(false);
  });

  it('never mutates input originals', () => {
    const game = {
      name: 'Sunday',
      description: 'Bring balls',
      localizedText: projection(),
    };
    resolveDisplayedGameText(game, { locale: 'ru' });
    expect(game.name).toBe('Sunday');
    expect(game.description).toBe('Bring balls');
  });
});
