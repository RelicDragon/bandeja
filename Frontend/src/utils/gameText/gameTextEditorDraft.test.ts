import { describe, expect, it } from 'vitest';
import type { GameTextEditorFieldDto } from './gameTextEditor.types';
import {
  initialGameTextEditorFieldDraft,
  retainDraftAfterConflictRefresh,
  shouldReseedEditorDrafts,
} from './gameTextEditorDraft';

function field(patch: Partial<GameTextEditorFieldDto> = {}): GameTextEditorFieldDto {
  return {
    field: 'name',
    original: 'Sunday social',
    sourceRevision: 1,
    effectiveText: 'Social del domingo',
    automaticText: 'Social del domingo',
    generationState: 'ready',
    provenance: 'automatic',
    hasActiveCorrection: false,
    needsReview: false,
    reviewCorrectionText: null,
    recordRevision: 1,
    preserveAsOriginal: false,
    ...patch,
  };
}

describe('gameTextEditorDraft', () => {
  it('seeds draft from effective / correction / review text', () => {
    expect(initialGameTextEditorFieldDraft(field())).toBe('Social del domingo');
    expect(
      initialGameTextEditorFieldDraft(
        field({
          hasActiveCorrection: true,
          effectiveText: 'Edited',
        }),
      ),
    ).toBe('Edited');
    expect(
      initialGameTextEditorFieldDraft(
        field({
          needsReview: true,
          reviewCorrectionText: 'Old correction',
          effectiveText: 'New auto',
        }),
      ),
    ).toBe('Old correction');
  });

  it('keeps local draft after conflict refresh while source can update separately', () => {
    const localDraft = 'My in-progress correction';
    const refreshed = field({
      original: 'Sunday social v2',
      sourceRevision: 2,
      recordRevision: 4,
      effectiveText: 'Someone else saved',
      hasActiveCorrection: true,
    });

    expect(retainDraftAfterConflictRefresh(localDraft)).toBe(localDraft);
    expect(shouldReseedEditorDrafts('es', 'es')).toBe(false);
    expect(shouldReseedEditorDrafts('es', 'ru')).toBe(true);
    // Review surface uses refreshed original; draft is independent.
    expect(refreshed.original).toBe('Sunday social v2');
    expect(refreshed.sourceRevision).toBe(2);
    expect(retainDraftAfterConflictRefresh(localDraft)).not.toBe(refreshed.effectiveText);
  });
});
