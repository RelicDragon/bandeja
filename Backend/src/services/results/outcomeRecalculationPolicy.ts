import { EntityType, ResultsStatus, RoundType } from '@prisma/client';

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

export function shouldRebuildLeagueStandingsForGame(input: {
  entityType: EntityType;
  parentId: string | null;
  roundType?: RoundType | null;
}): boolean {
  return (
    input.entityType === EntityType.LEAGUE &&
    Boolean(input.parentId) &&
    input.roundType !== RoundType.PLAYOFF
  );
}
