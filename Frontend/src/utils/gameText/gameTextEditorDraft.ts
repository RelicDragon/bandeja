import type { GameTextEditorFieldDto } from './gameTextEditor.types';

/** Seed the translation textarea from the current server field. */
export function initialGameTextEditorFieldDraft(field: GameTextEditorFieldDto): string {
  if (field.hasActiveCorrection) {
    return field.effectiveText ?? '';
  }
  if (field.needsReview) {
    return field.reviewCorrectionText ?? field.effectiveText ?? '';
  }
  return field.effectiveText ?? '';
}

/**
 * After a 409 conflict refresh, keep the user's local draft while the panel
 * shows the updated original / revisions from the refreshed field DTO.
 * Drafts re-seed only when the organizer opens a different language.
 */
export function shouldReseedEditorDrafts(
  previousLocale: string,
  nextLocale: string,
): boolean {
  return previousLocale !== nextLocale;
}

export function retainDraftAfterConflictRefresh(localDraft: string): string {
  return localDraft;
}
