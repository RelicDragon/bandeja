import {
  getMatchScoresForDelta as getMatchScoresForDeltaShared,
  getSetScoreForDelta as getSetScoreForDeltaShared,
  type SetLike,
  type SetScoreDeltaContext,
} from '@bandeja/shared/setScoreDelta';

export type { SetLike, SetScoreDeltaContext };

export function getSetScoreForDelta(
  set: SetLike,
  teamNumber: 1 | 2,
  setIndex?: number,
  allSets?: SetLike[],
  context?: SetScoreDeltaContext,
): number {
  const index = setIndex ?? 0;
  const rows = allSets ?? [set];
  return getSetScoreForDeltaShared(set, teamNumber, index, rows, context);
}

export function getMatchScoresForDelta(
  sets: SetLike[],
  context?: SetScoreDeltaContext,
): { teamAScore: number; teamBScore: number } {
  return getMatchScoresForDeltaShared(sets, context);
}
