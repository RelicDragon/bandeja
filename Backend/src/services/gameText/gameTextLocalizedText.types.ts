import type { AppUiLanguage } from '@bandeja/app-locale';

/** Public read-path field state for one localized game text field. */
export type GameTextLocalizedFieldState =
  | 'ready'
  | 'pending'
  | 'failed'
  | 'not_needed'
  | 'original';

export type GameTextLocalizedFieldProvenance =
  | 'manual_override'
  | 'automatic'
  | 'same_language'
  | 'preserved_name'
  | 'empty_source'
  | 'original';

export type GameTextLocalizedFieldProjection = {
  text: string | null;
  sourceRevision: number;
  state: GameTextLocalizedFieldState;
  provenance: GameTextLocalizedFieldProvenance;
};

/** Additive projection for the requested app UI locale only. */
export type GameLocalizedTextProjection = {
  locale: AppUiLanguage;
  name: GameTextLocalizedFieldProjection;
  description: GameTextLocalizedFieldProjection;
};

export type GameTextTranslationRowForResolve = {
  field: 'name' | 'description';
  locale: string;
  sourceRevision: number;
  automaticText: string | null;
  generationState: 'pending' | 'ready' | 'failed' | 'not_needed';
  provenance: GameTextLocalizedFieldProvenance | null;
  manualOverrideText: string | null;
  manualOverrideSourceRevision: number | null;
};

export type GameTextSourceMetaForResolve = {
  nameSourceRevision: number;
  descriptionSourceRevision: number;
  keepOriginalNameInAllLocales: boolean;
};
