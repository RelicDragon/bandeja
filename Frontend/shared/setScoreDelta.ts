import {
  ratingSetUsesTiebreakMargin,
  resolveAutomaticSetScoringKind,
  type AutomaticRelaxedRulesLike,
  type AutomaticRelaxedSetLike,
  type AutomaticSetScoringKind,
} from './automaticRelaxedScoring';

export interface SetLike extends AutomaticRelaxedSetLike {
  teamAScore?: number;
  teamBScore?: number;
  teamA?: number;
  teamB?: number;
  automaticSetKind?: AutomaticSetScoringKind | null;
}

export type SetScoreDeltaContext = {
  matchMetadata?: Record<string, unknown> | null;
  rules?: AutomaticRelaxedRulesLike | null;
};

function teamAScoreOf(set: SetLike): number {
  return set.teamAScore ?? set.teamA ?? 0;
}

function teamBScoreOf(set: SetLike): number {
  return set.teamBScore ?? set.teamB ?? 0;
}

export function getSetScoreForDelta(
  set: SetLike,
  side: 'A' | 'B' | 1 | 2,
  setIndex: number,
  allSets: SetLike[],
  context?: SetScoreDeltaContext,
): number {
  const isTeamA = side === 'A' || side === 1;
  const a = teamAScoreOf(set);
  const b = teamBScoreOf(set);
  const automaticSetKind =
    set.automaticSetKind ??
    (context?.rules
      ? resolveAutomaticSetScoringKind(setIndex, allSets, context.matchMetadata, context.rules)
      : null);

  if (
    ratingSetUsesTiebreakMargin({
      isTieBreak: !!set.isTieBreak,
      automaticSetKind,
    })
  ) {
    const aWon = a > b;
    return isTeamA ? (aWon ? 1 : 0) : (aWon ? 0 : 1);
  }

  return isTeamA ? a : b;
}

export function getMatchScoresForDelta(
  sets: SetLike[],
  context?: SetScoreDeltaContext,
): { teamAScore: number; teamBScore: number } {
  let teamAScore = 0;
  let teamBScore = 0;
  sets.forEach((set, index) => {
    teamAScore += getSetScoreForDelta(set, 1, index, sets, context);
    teamBScore += getSetScoreForDelta(set, 2, index, sets, context);
  });
  return { teamAScore, teamBScore };
}

/** Display suffix for set scores; omit `scoreKind` for legacy classic rows. */
export function automaticSetScoreSuffix(
  scoreKind: AutomaticSetScoringKind | null | undefined,
  isTieBreak?: boolean,
): string {
  if (scoreKind === 'SUPER_TIEBREAK') return ' STB';
  if (scoreKind === 'AMERICANO_POINTS') return ' pts';
  if (isTieBreak) return ' TB';
  return '';
}

export function resolveAutomaticSetScoreKindForDisplay(
  setIndex: number,
  sets: SetLike[],
  matchMetadata: Record<string, unknown> | null | undefined,
  rules: AutomaticRelaxedRulesLike | null | undefined,
): AutomaticSetScoringKind | undefined {
  if (!rules) return undefined;
  return resolveAutomaticSetScoringKind(setIndex, sets, matchMetadata, rules) ?? undefined;
}
