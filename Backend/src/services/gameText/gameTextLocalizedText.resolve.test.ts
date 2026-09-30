import assert from 'node:assert/strict';
import { resolveGameLocalizedText } from './gameTextLocalizedText.resolve';
import { resolveRequestAppUiLocale } from './gameTextRequestLocale';
import {
  collectGameIdsForLocalizedText,
  gameTextFieldsInFlight,
} from './gameTextLocalizedText.batch';
import type { GameTextTranslationRowForResolve } from './gameTextLocalizedText.types';

function row(
  partial: Partial<GameTextTranslationRowForResolve> & {
    field: 'name' | 'description';
  },
): GameTextTranslationRowForResolve {
  return {
    locale: 'ru',
    sourceRevision: 1,
    automaticText: null,
    generationState: 'pending',
    provenance: null,
    manualOverrideText: null,
    manualOverrideSourceRevision: null,
    ...partial,
  };
}

function run() {
  // Override wins over automatic
  const override = resolveGameLocalizedText({
    locale: 'ru',
    name: 'Sunday social',
    description: 'Bring balls',
    meta: {
      nameSourceRevision: 2,
      descriptionSourceRevision: 1,
      keepOriginalNameInAllLocales: false,
    },
    rows: [
      row({
        field: 'name',
        sourceRevision: 2,
        automaticText: 'Авто название',
        generationState: 'ready',
        provenance: 'automatic',
        manualOverrideText: 'Ручное имя',
        manualOverrideSourceRevision: 2,
      }),
    ],
  });
  assert.equal(override.name.text, 'Ручное имя');
  assert.equal(override.name.provenance, 'manual_override');
  assert.equal(override.name.state, 'ready');
  assert.equal(override.name.sourceRevision, 2);
  // Originals unchanged in projection input — response keeps separate fields
  assert.equal(override.description.text, 'Bring balls');
  assert.equal(override.description.state, 'pending');

  // Automatic wins when no override
  const automatic = resolveGameLocalizedText({
    locale: 'ru',
    name: 'Sunday social',
    description: 'Bring balls',
    meta: {
      nameSourceRevision: 1,
      descriptionSourceRevision: 1,
      keepOriginalNameInAllLocales: false,
    },
    rows: [
      row({
        field: 'name',
        sourceRevision: 1,
        automaticText: 'Воскресный сошиал',
        generationState: 'ready',
        provenance: 'automatic',
      }),
      row({
        field: 'description',
        sourceRevision: 1,
        automaticText: 'Принесите мячи',
        generationState: 'ready',
        provenance: 'automatic',
      }),
    ],
  });
  assert.equal(automatic.name.text, 'Воскресный сошиал');
  assert.equal(automatic.name.provenance, 'automatic');
  assert.equal(automatic.description.text, 'Принесите мячи');

  // Fallback original when no row / pending
  const pending = resolveGameLocalizedText({
    locale: 'es',
    name: 'Open play',
    description: null,
    meta: {
      nameSourceRevision: 0,
      descriptionSourceRevision: 0,
      keepOriginalNameInAllLocales: false,
    },
    rows: [
      row({
        field: 'name',
        locale: 'es',
        sourceRevision: 0,
        generationState: 'pending',
      }),
    ],
  });
  assert.equal(pending.name.text, 'Open play');
  assert.equal(pending.name.state, 'pending');
  assert.equal(pending.name.provenance, 'original');
  assert.equal(pending.description.text, null);
  assert.equal(pending.description.provenance, 'empty_source');

  const noRow = resolveGameLocalizedText({
    locale: 'es',
    name: 'Open play',
    description: 'Hi',
  });
  assert.equal(noRow.name.text, 'Open play');
  assert.equal(noRow.name.state, 'pending');
  assert.equal(noRow.description.text, 'Hi');
  assert.equal(noRow.description.state, 'pending');

  // Preserve-name policy
  const preserved = resolveGameLocalizedText({
    locale: 'ja',
    name: 'Bandeja Open',
    description: 'Welcome',
    meta: {
      nameSourceRevision: 3,
      descriptionSourceRevision: 1,
      keepOriginalNameInAllLocales: true,
    },
    rows: [
      row({
        field: 'name',
        locale: 'ja',
        sourceRevision: 3,
        automaticText: 'バンデハオープン',
        generationState: 'ready',
        provenance: 'automatic',
      }),
      row({
        field: 'description',
        locale: 'ja',
        sourceRevision: 1,
        automaticText: 'ようこそ',
        generationState: 'ready',
        provenance: 'automatic',
      }),
    ],
  });
  assert.equal(preserved.name.text, 'Bandeja Open');
  assert.equal(preserved.name.provenance, 'preserved_name');
  assert.equal(preserved.name.state, 'not_needed');
  assert.equal(preserved.description.text, 'ようこそ');

  // Clear field → empty display (ignore stale translation)
  const cleared = resolveGameLocalizedText({
    locale: 'ru',
    name: null,
    description: '  ',
    meta: {
      nameSourceRevision: 4,
      descriptionSourceRevision: 2,
      keepOriginalNameInAllLocales: false,
    },
    rows: [
      row({
        field: 'name',
        sourceRevision: 3,
        automaticText: 'Старое',
        generationState: 'ready',
        provenance: 'automatic',
      }),
      row({
        field: 'description',
        sourceRevision: 1,
        automaticText: 'Старое описание',
        generationState: 'ready',
        provenance: 'automatic',
      }),
    ],
  });
  assert.equal(cleared.name.text, null);
  assert.equal(cleared.name.provenance, 'empty_source');
  assert.equal(cleared.description.text, null);
  assert.equal(cleared.description.provenance, 'empty_source');

  // Stale revision (source changed) → original + pending, not old automatic
  const stale = resolveGameLocalizedText({
    locale: 'ru',
    name: 'New title',
    description: 'New desc',
    meta: {
      nameSourceRevision: 5,
      descriptionSourceRevision: 5,
      keepOriginalNameInAllLocales: false,
    },
    rows: [
      row({
        field: 'name',
        sourceRevision: 4,
        automaticText: 'Old RU',
        generationState: 'ready',
        provenance: 'automatic',
        manualOverrideText: 'Old override',
        manualOverrideSourceRevision: 4,
      }),
    ],
  });
  assert.equal(stale.name.text, 'New title');
  assert.equal(stale.name.state, 'pending');
  assert.notEqual(stale.name.text, 'Old RU');
  assert.notEqual(stale.name.text, 'Old override');

  // Wrong / unsupported locale normalizes via app-locale
  const badLocale = resolveGameLocalizedText({
    locale: 'xx-QQ',
    name: 'Hello',
    description: null,
  });
  assert.equal(badLocale.locale, 'en');
  assert.equal(badLocale.name.text, 'Hello');

  const fromHeader = resolveRequestAppUiLocale({
    query: {},
    headers: { 'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8' },
  });
  assert.equal(fromHeader, 'ru');

  const queryWins = resolveRequestAppUiLocale({
    query: { locale: 'ja' },
    headers: { 'x-app-locale': 'ru', 'accept-language': 'es' },
  });
  assert.equal(queryWins, 'ja');

  const unsupportedHeader = resolveRequestAppUiLocale({
    query: {},
    headers: { 'x-app-locale': 'tlh' },
  });
  assert.equal(unsupportedHeader, 'en');

  // Same-language ready → original, not_needed
  const sameLang = resolveGameLocalizedText({
    locale: 'en',
    name: 'Open',
    description: 'Desc',
    meta: {
      nameSourceRevision: 1,
      descriptionSourceRevision: 1,
      keepOriginalNameInAllLocales: false,
    },
    rows: [
      row({
        field: 'name',
        locale: 'en',
        sourceRevision: 1,
        automaticText: 'Open',
        generationState: 'ready',
        provenance: 'same_language',
      }),
    ],
  });
  assert.equal(sameLang.name.text, 'Open');
  assert.equal(sameLang.name.state, 'not_needed');
  assert.equal(sameLang.name.provenance, 'same_language');

  // Projection must not mutate input originals (resolve returns separate object)
  const originals = { name: 'Keep me', description: 'Also keep' };
  const projected = resolveGameLocalizedText({
    locale: 'ru',
    name: originals.name,
    description: originals.description,
    meta: {
      nameSourceRevision: 1,
      descriptionSourceRevision: 1,
      keepOriginalNameInAllLocales: false,
    },
    rows: [
      row({
        field: 'name',
        sourceRevision: 1,
        automaticText: 'Сохрани',
        generationState: 'ready',
        provenance: 'automatic',
      }),
    ],
  });
  assert.equal(originals.name, 'Keep me');
  assert.equal(originals.description, 'Also keep');
  assert.equal(projected.name.text, 'Сохрани');
  assert.notEqual(projected.name.text, originals.name);

  // Find-style: omit description field work
  const findCard = resolveGameLocalizedText({
    locale: 'ru',
    name: 'Card',
    description: 'Should ignore',
    includeDescription: false,
    rows: [
      row({
        field: 'description',
        sourceRevision: 0,
        automaticText: 'Игнор',
        generationState: 'ready',
        provenance: 'automatic',
      }),
    ],
  });
  assert.equal(findCard.name.text, 'Card');
  assert.equal(findCard.description.text, null);
  assert.equal(findCard.description.provenance, 'empty_source');

  const ids = collectGameIdsForLocalizedText([
    {
      id: 'g1',
      parentId: 'season-1',
      parent: {
        id: 'season-1',
        leagueSeason: { game: { id: 'season-1' } },
      },
    },
  ]);
  assert.deepEqual(ids.sort(), ['g1', 'season-1']);

  // Legacy season (prod cmu2s0kkq…): name never tracked (rev 0, no rows, no job) →
  // serve original, not pending forever.
  const legacyNoJob = resolveGameLocalizedText({
    locale: 'hi',
    name: 'Jesen-Zima 2026',
    description: 'Opis sezone',
    meta: {
      nameSourceRevision: 0,
      descriptionSourceRevision: 3,
      keepOriginalNameInAllLocales: false,
    },
    rows: [
      // Description job failed terminally; row stuck at pending.
      row({ field: 'description', locale: 'hi', sourceRevision: 3 }),
    ],
    inFlight: { name: false, description: false },
  });
  assert.equal(legacyNoJob.name.text, 'Jesen-Zima 2026');
  assert.equal(legacyNoJob.name.state, 'original');
  assert.equal(legacyNoJob.name.provenance, 'original');
  assert.equal(legacyNoJob.description.text, 'Opis sezone');
  assert.equal(legacyNoJob.description.state, 'failed');
  assert.equal(legacyNoJob.description.provenance, 'original');

  // Same rows while a job is still queued → pending (client keeps polling briefly)
  const withJob = resolveGameLocalizedText({
    locale: 'hi',
    name: 'Jesen-Zima 2026',
    description: 'Opis sezone',
    meta: {
      nameSourceRevision: 1,
      descriptionSourceRevision: 3,
      keepOriginalNameInAllLocales: false,
    },
    rows: [row({ field: 'description', locale: 'hi', sourceRevision: 3 })],
    inFlight: { name: true, description: true },
  });
  assert.equal(withJob.name.state, 'pending');
  assert.equal(withJob.description.state, 'pending');

  // Stale row + no job (source bumped, generation disabled) → original, not pending
  const staleNoJob = resolveGameLocalizedText({
    locale: 'ru',
    name: 'New name',
    description: null,
    meta: {
      nameSourceRevision: 2,
      descriptionSourceRevision: 0,
      keepOriginalNameInAllLocales: false,
    },
    rows: [
      row({
        field: 'name',
        sourceRevision: 1,
        automaticText: 'Старое',
        generationState: 'ready',
        provenance: 'automatic',
      }),
    ],
    inFlight: { name: false, description: false },
  });
  assert.equal(staleNoJob.name.text, 'New name');
  assert.equal(staleNoJob.name.state, 'original');

  // Ready rows are unaffected by in-flight flags
  const readyNoJob = resolveGameLocalizedText({
    locale: 'ru',
    name: 'Sunday social',
    description: null,
    meta: {
      nameSourceRevision: 1,
      descriptionSourceRevision: 0,
      keepOriginalNameInAllLocales: false,
    },
    rows: [
      row({
        field: 'name',
        sourceRevision: 1,
        automaticText: 'Воскресный сошиал',
        generationState: 'ready',
        provenance: 'automatic',
      }),
    ],
    inFlight: { name: false, description: false },
  });
  assert.equal(readyNoJob.name.state, 'ready');
  assert.equal(readyNoJob.name.text, 'Воскресный сошиал');

  // In-flight detection only counts jobs at the current source revisions
  const meta = {
    nameSourceRevision: 0,
    descriptionSourceRevision: 3,
    keepOriginalNameInAllLocales: false,
  };
  assert.deepEqual(gameTextFieldsInFlight(meta, []), {
    name: false,
    description: false,
  });
  assert.deepEqual(
    gameTextFieldsInFlight(meta, [
      // Superseded-by-revision job (desc rev 2) does not count
      {
        includeName: false,
        includeDescription: true,
        nameSourceRevision: 0,
        descriptionSourceRevision: 2,
      },
    ]),
    { name: false, description: false },
  );
  assert.deepEqual(
    gameTextFieldsInFlight(meta, [
      {
        includeName: true,
        includeDescription: true,
        nameSourceRevision: 0,
        descriptionSourceRevision: 3,
      },
    ]),
    { name: true, description: true },
  );
  // No meta row → revisions default to 0
  assert.deepEqual(
    gameTextFieldsInFlight(null, [
      {
        includeName: true,
        includeDescription: false,
        nameSourceRevision: 0,
        descriptionSourceRevision: 0,
      },
    ]),
    { name: true, description: false },
  );

  console.log('gameTextLocalizedText.resolve tests passed');
}

run();
