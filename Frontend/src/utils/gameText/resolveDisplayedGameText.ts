import { normalizeAppUiLanguage, type AppUiLanguage } from '@bandeja/app-locale';
import type {
  GameLocalizedTextProjection,
  GameTextDisplaySource,
  GameTextLocalizedFieldProjection,
} from './gameLocalizedText.types';

export type ResolveDisplayedGameTextOptions = {
  /** Force authored originals (Show original toggle). */
  showOriginal?: boolean;
  /** Expected app UI locale; if projection locale mismatches, fall back to originals. */
  locale?: string | null;
};

export type DisplayedGameText = {
  locale: AppUiLanguage;
  name: string | null;
  description: string | null;
  nameField: GameTextLocalizedFieldProjection | null;
  descriptionField: GameTextLocalizedFieldProjection | null;
  /** True when display differs from authored originals for either field. */
  isTranslated: boolean;
  showOriginal: boolean;
};

function fieldText(
  original: string | null | undefined,
  field: GameTextLocalizedFieldProjection | null | undefined,
  showOriginal: boolean,
): string | null {
  if (showOriginal || !field) {
    return original ?? null;
  }
  return field.text;
}

/**
 * Client display resolver: prefer `localizedText` projection; never mutate originals.
 * Pending/missing projection → authored original.
 */
export function resolveDisplayedGameText(
  game: GameTextDisplaySource | null | undefined,
  options?: ResolveDisplayedGameTextOptions,
): DisplayedGameText {
  const showOriginal = options?.showOriginal === true;
  const requestedLocale = normalizeAppUiLanguage(options?.locale);
  const projection: GameLocalizedTextProjection | null | undefined = game?.localizedText;
  const localeMatches =
    !!projection && projection.locale === requestedLocale;

  const useProjection = !showOriginal && localeMatches;
  const nameField = useProjection ? projection.name : null;
  const descriptionField = useProjection ? projection.description : null;

  const name = fieldText(game?.name, nameField, showOriginal);
  const description = fieldText(game?.description, descriptionField, showOriginal);

  const isTranslated =
    useProjection &&
    ((nameField != null &&
      nameField.text !== (game?.name ?? null) &&
      nameField.provenance !== 'original' &&
      nameField.provenance !== 'empty_source' &&
      nameField.provenance !== 'preserved_name') ||
      (descriptionField != null &&
        descriptionField.text !== (game?.description ?? null) &&
        descriptionField.provenance !== 'original' &&
        descriptionField.provenance !== 'empty_source'));

  return {
    locale: useProjection ? projection.locale : requestedLocale,
    name,
    description,
    nameField,
    descriptionField,
    isTranslated: !!isTranslated,
    showOriginal,
  };
}
