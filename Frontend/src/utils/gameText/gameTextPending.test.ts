import { describe, expect, it } from 'vitest';
import { isGameTextTranslationPending } from './gameTextPending';
import type { GameLocalizedTextProjection } from './gameLocalizedText.types';

function projection(
  overrides: Partial<{
    nameState: GameLocalizedTextProjection['name']['state'];
    descriptionState: GameLocalizedTextProjection['description']['state'];
  }> = {},
): GameLocalizedTextProjection {
  return {
    locale: 'ru',
    name: {
      text: 'A',
      sourceRevision: 1,
      state: overrides.nameState ?? 'ready',
      provenance: 'automatic',
    },
    description: {
      text: 'B',
      sourceRevision: 1,
      state: overrides.descriptionState ?? 'ready',
      provenance: 'automatic',
    },
  };
}

describe('isGameTextTranslationPending', () => {
  it('is false for null projection', () => {
    expect(isGameTextTranslationPending(null)).toBe(false);
  });

  it('is true when name or description is pending', () => {
    expect(isGameTextTranslationPending(projection({ nameState: 'pending' }))).toBe(true);
    expect(isGameTextTranslationPending(projection({ descriptionState: 'pending' }))).toBe(true);
  });

  it('is false when ready', () => {
    expect(isGameTextTranslationPending(projection())).toBe(false);
  });
});
