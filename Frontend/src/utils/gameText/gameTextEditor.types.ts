import type { AppUiLanguage } from '@bandeja/app-locale';

export type GameTextEditorLocaleStatus =
  | 'ready'
  | 'edited'
  | 'updating'
  | 'needs_review'
  | 'retry'
  | 'not_needed';

export type GameTextEditorFieldDto = {
  field: 'name' | 'description';
  original: string | null;
  sourceRevision: number;
  effectiveText: string | null;
  automaticText: string | null;
  generationState: string | null;
  provenance: string | null;
  hasActiveCorrection: boolean;
  needsReview: boolean;
  reviewCorrectionText: string | null;
  recordRevision: number | null;
  preserveAsOriginal: boolean;
};

export type GameTextEditorLocaleDto = {
  locale: AppUiLanguage;
  status: GameTextEditorLocaleStatus;
  name: GameTextEditorFieldDto;
  description: GameTextEditorFieldDto;
};

export type GameTextTranslationsEditorDto = {
  gameId: string;
  name: string | null;
  description: string | null;
  meta: {
    nameSourceRevision: number;
    descriptionSourceRevision: number;
    keepOriginalNameInAllLocales: boolean;
    nameSourceLocaleOverride: string | null;
    descriptionSourceLocaleOverride: string | null;
  };
  locales: GameTextEditorLocaleDto[];
};

export type GameTextEditorFieldPatch = {
  action: 'set' | 'clear';
  text?: string | null;
  expectedSourceRevision: number;
  expectedRecordRevision: number | null;
};

export type GameTextTranslationRetryResult = {
  queued: boolean;
  jobId: string | null;
};
