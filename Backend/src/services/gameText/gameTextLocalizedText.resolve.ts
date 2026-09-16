import { normalizeAppUiLanguage } from '@bandeja/app-locale';
import { normalizeAuthoredGameText } from './gameTextAuthoredText';
import type {
  GameLocalizedTextProjection,
  GameTextLocalizedFieldProjection,
  GameTextLocalizedFieldProvenance,
  GameTextSourceMetaForResolve,
  GameTextTranslationRowForResolve,
} from './gameTextLocalizedText.types';

const DEFAULT_META: GameTextSourceMetaForResolve = {
  nameSourceRevision: 0,
  descriptionSourceRevision: 0,
  keepOriginalNameInAllLocales: false,
};

export type ResolveGameLocalizedTextInput = {
  /** Raw request locale; normalized via normalizeAppUiLanguage. */
  locale: string | null | undefined;
  name: string | null | undefined;
  description: string | null | undefined;
  meta?: GameTextSourceMetaForResolve | null;
  /** Rows for this game + normalized locale only. */
  rows?: readonly GameTextTranslationRowForResolve[] | null;
  /** When false, description projection is empty_source without consulting rows. */
  includeDescription?: boolean;
};

function fieldProjection(
  text: string | null,
  sourceRevision: number,
  state: GameTextLocalizedFieldProjection['state'],
  provenance: GameTextLocalizedFieldProvenance,
): GameTextLocalizedFieldProjection {
  return { text, sourceRevision, state, provenance };
}

function resolveOneField(input: {
  original: string | null | undefined;
  sourceRevision: number;
  preserveAsOriginal: boolean;
  row: GameTextTranslationRowForResolve | null | undefined;
}): GameTextLocalizedFieldProjection {
  const original = normalizeAuthoredGameText(input.original);
  const revision = input.sourceRevision;

  if (original === null) {
    return fieldProjection(null, revision, 'not_needed', 'empty_source');
  }

  if (input.preserveAsOriginal) {
    return fieldProjection(original, revision, 'not_needed', 'preserved_name');
  }

  const row = input.row;
  if (
    row &&
    row.manualOverrideText != null &&
    row.manualOverrideSourceRevision === revision
  ) {
    return fieldProjection(
      row.manualOverrideText,
      revision,
      'ready',
      'manual_override',
    );
  }

  if (row && row.sourceRevision === revision) {
    if (row.generationState === 'ready') {
      if (row.provenance === 'same_language' || row.automaticText == null) {
        return fieldProjection(original, revision, 'not_needed', 'same_language');
      }
      return fieldProjection(row.automaticText, revision, 'ready', 'automatic');
    }
    if (row.generationState === 'pending') {
      return fieldProjection(original, revision, 'pending', 'original');
    }
    if (row.generationState === 'failed') {
      return fieldProjection(original, revision, 'failed', 'original');
    }
    if (row.generationState === 'not_needed') {
      const provenance: GameTextLocalizedFieldProvenance =
        row.provenance === 'same_language' ||
        row.provenance === 'preserved_name' ||
        row.provenance === 'empty_source'
          ? row.provenance
          : 'original';
      return fieldProjection(original, revision, 'not_needed', provenance);
    }
  }

  // No current row (missing or stale revision) → show current original; pending until ready.
  return fieldProjection(original, revision, 'pending', 'original');
}

function rowForField(
  rows: readonly GameTextTranslationRowForResolve[] | null | undefined,
  field: 'name' | 'description',
): GameTextTranslationRowForResolve | null {
  if (!rows) return null;
  return rows.find((r) => r.field === field) ?? null;
}

/**
 * Resolve effective display text for one game at one app UI locale.
 * Never rewrites authored originals — returns a separate projection.
 */
export function resolveGameLocalizedText(
  input: ResolveGameLocalizedTextInput,
): GameLocalizedTextProjection {
  const locale = normalizeAppUiLanguage(input.locale);
  const meta = input.meta ?? DEFAULT_META;
  const includeDescription = input.includeDescription !== false;

  const name = resolveOneField({
    original: input.name,
    sourceRevision: meta.nameSourceRevision,
    preserveAsOriginal: meta.keepOriginalNameInAllLocales,
    row: rowForField(input.rows, 'name'),
  });

  const description = includeDescription
    ? resolveOneField({
        original: input.description,
        sourceRevision: meta.descriptionSourceRevision,
        preserveAsOriginal: false,
        row: rowForField(input.rows, 'description'),
      })
    : fieldProjection(
        null,
        meta.descriptionSourceRevision,
        'not_needed',
        'empty_source',
      );

  return { locale, name, description };
}
