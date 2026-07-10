import { getMatchScoresForDelta, type SetScoreDeltaContext } from '@shared/setScoreDelta';

export {
  getSetScoreForDelta,
  getMatchScoresForDelta,
  automaticSetScoreSuffix,
  resolveAutomaticSetScoreKindForDisplay,
  type SetLike,
  type SetScoreDeltaContext,
} from '@shared/setScoreDelta';

export type { AutomaticSetScoringKind } from '@shared/automaticRelaxedScoring';

export function getMatchScoresForDeltaAsAB(
  sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean }>,
  context?: SetScoreDeltaContext,
): { scoreA: number; scoreB: number } {
  const { teamAScore, teamBScore } = getMatchScoresForDelta(sets, context);
  return { scoreA: teamAScore, scoreB: teamBScore };
}
