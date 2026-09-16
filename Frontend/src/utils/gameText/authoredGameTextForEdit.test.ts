import { describe, expect, it } from 'vitest';
import {
  authoredGameTextForEdit,
  shouldLabelAuthoredEditAsOriginal,
} from './authoredGameTextForEdit';
import type { GameLocalizedTextProjection, GameTextDisplaySource } from './gameLocalizedText.types';

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

/** Mirrors EditGameInfoModal / EventEditListingModal open init. */
function modalInitialValues(game: GameTextDisplaySource) {
  const authored = authoredGameTextForEdit(game);
  return {
    name: authored.name,
    description: authored.description,
  };
}

describe('authoredGameTextForEdit', () => {
  it('seeds only authored name and description', () => {
    expect(
      authoredGameTextForEdit({
        name: 'Sunday social',
        description: 'Bring balls',
        localizedText: projection(),
      }),
    ).toEqual({
      name: 'Sunday social',
      description: 'Bring balls',
    });
  });

  it('ignores localizedText even when originals are empty', () => {
    expect(
      authoredGameTextForEdit({
        name: null,
        description: undefined,
        localizedText: projection(),
      }),
    ).toEqual({ name: '', description: '' });
  });

  it('never copies localized projection text into edit seeds', () => {
    const seed = authoredGameTextForEdit({
      name: 'Original title',
      description: 'Original body',
      localizedText: projection({
        name: { text: 'Translated title' },
        description: { text: 'Translated body' },
      }),
    });

    expect(seed.name).toBe('Original title');
    expect(seed.description).toBe('Original body');
    expect(seed.name).not.toContain('Translated');
    expect(seed.description).not.toContain('Translated');
  });
});

describe('edit modal initial values ignore localizedText', () => {
  it('EditGameInfoModal-style init keeps authored fields', () => {
    const game: GameTextDisplaySource = {
      name: 'Sunday social',
      description: 'Bring a tube',
      localizedText: projection({
        name: { text: 'Воскресный социальный' },
        description: { text: 'Принесите тубус' },
      }),
    };
    expect(modalInitialValues(game)).toEqual({
      name: 'Sunday social',
      description: 'Bring a tube',
    });
  });

  it('EventEditListingModal-style init keeps authored fields', () => {
    const game: GameTextDisplaySource = {
      name: 'Open camp',
      description: 'All levels',
      localizedText: projection({
        locale: 'es',
        name: { text: 'Campamento abierto' },
        description: { text: 'Todos los niveles' },
      }),
    };
    expect(modalInitialValues(game)).toEqual({
      name: 'Open camp',
      description: 'All levels',
    });
  });
});

describe('shouldLabelAuthoredEditAsOriginal', () => {
  it('is true when details would show a translation for the locale', () => {
    expect(
      shouldLabelAuthoredEditAsOriginal(
        {
          name: 'Sunday',
          description: 'Bring balls',
          localizedText: projection(),
        },
        'ru',
      ),
    ).toBe(true);
  });

  it('is false when create/edit has no translated display', () => {
    expect(
      shouldLabelAuthoredEditAsOriginal(
        { name: 'Sunday', description: 'Bring balls' },
        'ru',
      ),
    ).toBe(false);
  });
});
