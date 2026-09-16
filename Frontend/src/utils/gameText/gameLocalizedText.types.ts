import type { AppUiLanguage } from '@bandeja/app-locale';

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

/** Additive server projection for the requested app UI locale only. */
export type GameLocalizedTextProjection = {
  locale: AppUiLanguage;
  name: GameTextLocalizedFieldProjection;
  description: GameTextLocalizedFieldProjection;
};

export type GameTextDisplaySource = {
  name?: string | null;
  description?: string | null;
  localizedText?: GameLocalizedTextProjection | null;
};
