import type { GameTextGenerationState } from '@prisma/client';

/** Organizer-facing per-locale aggregate status (plan § Optional organizer controls). */
export type GameTextEditorLocaleStatus =
  | 'ready'
  | 'edited'
  | 'updating'
  | 'needs_review'
  | 'retry'
  | 'not_needed';

export type GameTextEditorFieldStatusInput = {
  /** Empty original → not needed for this field. */
  hasOriginal: boolean;
  /** Name preserved across locales. */
  preserveAsOriginal: boolean;
  generationState: GameTextGenerationState | null;
  /** Active correction for current source revision. */
  hasActiveCorrection: boolean;
  /** Prior correction retained after source bump (supersededAt null). */
  needsReview: boolean;
  /** Pending/running job covers this field for the locale. */
  jobInFlight: boolean;
};

export type GameTextEditorLocaleStatusInput = {
  name: GameTextEditorFieldStatusInput;
  description: GameTextEditorFieldStatusInput;
};

function fieldPriorityStatus(
  field: GameTextEditorFieldStatusInput,
): GameTextEditorLocaleStatus {
  if (!field.hasOriginal || field.preserveAsOriginal) {
    return 'not_needed';
  }
  if (field.needsReview) return 'needs_review';
  if (field.hasActiveCorrection) return 'edited';
  if (field.jobInFlight || field.generationState === 'pending') {
    return 'updating';
  }
  if (field.generationState === 'failed') return 'retry';
  if (field.generationState === 'not_needed') return 'not_needed';
  // Missing row (null) with no in-flight job → serving original; not stuck on Updating.
  return 'ready';
}

const STATUS_RANK: Record<GameTextEditorLocaleStatus, number> = {
  needs_review: 0,
  edited: 1,
  updating: 2,
  retry: 3,
  ready: 4,
  not_needed: 5,
};

/**
 * Aggregate name + description into one list-row status.
 * Worse/actionable states win (needs review > edited > updating > retry > ready > not needed).
 */
export function resolveGameTextEditorLocaleStatus(
  input: GameTextEditorLocaleStatusInput,
): GameTextEditorLocaleStatus {
  const nameStatus = fieldPriorityStatus(input.name);
  const descriptionStatus = fieldPriorityStatus(input.description);

  if (nameStatus === 'not_needed' && descriptionStatus === 'not_needed') {
    return 'not_needed';
  }

  const candidates = [nameStatus, descriptionStatus].filter(
    (s) => s !== 'not_needed',
  );
  let best = candidates[0] ?? 'not_needed';
  for (const status of candidates) {
    if (STATUS_RANK[status] < STATUS_RANK[best]) {
      best = status;
    }
  }
  return best;
}
