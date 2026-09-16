import { APP_UI_LANGUAGE_META, type AppUiLanguage } from '@bandeja/app-locale';
import type { GameTextEditorLocaleStatus } from './gameTextEditor.types';

export function gameTextEditorLanguageLabel(locale: AppUiLanguage): string {
  return APP_UI_LANGUAGE_META[locale]?.englishName ?? locale;
}

export function gameTextEditorStatusI18nKey(
  status: GameTextEditorLocaleStatus,
): string {
  switch (status) {
    case 'ready':
      return 'gameDetails.gameText.editor.statusReady';
    case 'edited':
      return 'gameDetails.gameText.editor.statusEdited';
    case 'updating':
      return 'gameDetails.gameText.editor.statusUpdating';
    case 'needs_review':
      return 'gameDetails.gameText.editor.statusNeedsReview';
    case 'retry':
      return 'gameDetails.gameText.editor.statusRetry';
    case 'not_needed':
      return 'gameDetails.gameText.editor.statusNotNeeded';
    default:
      return 'gameDetails.gameText.editor.statusReady';
  }
}
