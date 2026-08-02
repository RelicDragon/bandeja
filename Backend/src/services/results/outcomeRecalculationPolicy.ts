import { ResultsStatus } from '@prisma/client';

export type OutcomeRecalculationOptions = {
  /**
   * Keeps already-materialized downstream bracket fixtures intact while the
   * same result is recalculated for a configuration-only change (for example,
   * switching a completed game from non-rating to rating).
   */
  preserveBracketStructure?: boolean;
};

export function shouldCascadeBracketOutcomesUndo(input: {
  resultsStatus: ResultsStatus;
  hasBracketSlot: boolean;
  preserveBracketStructure: boolean;
}): boolean {
  return (
    input.resultsStatus === ResultsStatus.FINAL &&
    input.hasBracketSlot &&
    !input.preserveBracketStructure
  );
}
