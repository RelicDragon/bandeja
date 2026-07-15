import type { Match, Round, SetResult } from '@/types/gameResults';
import { parseMatchLiveEnvelope } from '@/types/matchLiveScoring';
import { isOfficialMatchSet } from '@/utils/matchSetRole';
import type { MatchTimerStatus } from '@/utils/matchTimer';
import { isClassicRules, type ScoringRules } from './rulebook';
import { validatePointsSet } from './validateSet';
import {
  computeMatchWinnerLiveScoring,
  getStandingsMatchOutcome,
  isLiveMatchCompleteForScoring,
} from './matchWinnerLive';

export {
  computeMatchWinnerLiveScoring,
  isMatchDecidedForLiveScoring,
  getStandingsMatchOutcome,
  isLiveMatchCompleteForScoring,
  isAutomaticRelaxedBySets,
  isMatchOfficialSetEntryComplete,
} from './matchWinnerLive';

export type MatchWinnerSide = 'A' | 'B' | null;

const isSetPlayed = (set: SetResult): boolean => set.teamA > 0 || set.teamB > 0;

const setWinner = (set: SetResult): MatchWinnerSide => {
  if (!isSetPlayed(set)) return null;
  if (set.teamA > set.teamB) return 'A';
  if (set.teamB > set.teamA) return 'B';
  return null;
};

/** @deprecated Prefer `computeMatchWinnerLiveScoring`. */
export const computeMatchWinner = computeMatchWinnerLiveScoring;

export const countSetsWon = (sets: SetResult[]): { a: number; b: number } => {
  let a = 0;
  let b = 0;
  for (const set of sets.filter(isOfficialMatchSet)) {
    const w = setWinner(set);
    if (w === 'A') a += 1;
    else if (w === 'B') b += 1;
  }
  return { a, b };
};

export const isMatchDecided = (sets: SetResult[], rules: ScoringRules): boolean =>
  getStandingsMatchOutcome(sets, rules) !== null;

export const isResultsMatchFinished = (
  match: Pick<Match, 'sets'>,
  rules: ScoringRules
): boolean => getStandingsMatchOutcome(match.sets, rules) !== null;

export const matchSetsHaveAnyNonZeroScore = (sets: SetResult[]): boolean =>
  sets.some((s) => s.teamA > 0 || s.teamB > 0);

export const isMatchTimerStarted = (match: Pick<Match, 'timer'>): boolean => {
  const st = match.timer?.status as MatchTimerStatus | undefined;
  if (!st || st === 'IDLE') return false;
  if (st === 'RUNNING' || st === 'PAUSED') return true;
  if (st === 'STOPPED') return (match.timer?.elapsedMs ?? 0) > 0;
  return false;
};

export const isMatchLiveScoringEnvelopeActive = (match: Pick<Match, 'metadata'>): boolean => {
  const env = parseMatchLiveEnvelope((match.metadata as Record<string, unknown> | undefined)?.liveScoring);
  if (!env) return false;
  if (env.revision > 0) return true;
  const st = env.state;
  if (!st || typeof st !== 'object') return false;
  const sets = (st as Record<string, unknown>).sets;
  if (!Array.isArray(sets)) return false;
  return sets.some((row) => {
    if (!row || typeof row !== 'object') return false;
    const o = row as Record<string, unknown>;
    return (Number(o.teamA) || 0) > 0 || (Number(o.teamB) || 0) > 0;
  });
};

/** Match has begun (scores, match timer, or live scoring) but is not finished per `isResultsMatchFinished`. */
export const isResultsMatchInProgressForResultsHeader = (match: Match, rules: ScoringRules): boolean => {
  if (isResultsMatchFinished(match, rules)) return false;
  return (
    matchSetsHaveAnyNonZeroScore(match.sets) ||
    isMatchTimerStarted(match) ||
    isMatchLiveScoringEnvelopeActive(match)
  );
};

export type RoundResultsHeaderTone = 'neutral' | 'in_progress' | 'complete';

export const getRoundResultsHeaderTone = (round: Round, rules: ScoringRules): RoundResultsHeaderTone => {
  const matches = round.matches;
  if (matches.length === 0) return 'neutral';
  if (matches.every((m) => isResultsMatchFinished(m, rules))) return 'complete';
  if (
    matches.some(
      (m) => isResultsMatchFinished(m, rules) || isResultsMatchInProgressForResultsHeader(m, rules)
    )
  ) {
    return 'in_progress';
  }
  return 'neutral';
};

export const getResultsMatchResolvedWinnerTeam = (
  match: Pick<Match, 'sets'>,
  rules: ScoringRules
): 'teamA' | 'teamB' | null => {
  const o = getStandingsMatchOutcome(match.sets, rules);
  if (o === 'A') return 'teamA';
  if (o === 'B') return 'teamB';
  return null;
};

/** Official points row is complete for live lock (same as live engine `isLivePointsFrozen`). */
export const isOfficialPointsBallBudgetExhausted = (
  sets: SetResult[],
  activeSetIndex: number,
  rules: ScoringRules
): boolean => {
  if (isClassicRules(rules) || rules.totalPointsPerSet <= 0) return false;
  const set = sets[activeSetIndex];
  if (!set || !isOfficialMatchSet(set)) return false;
  if (set.teamA + set.teamB !== rules.totalPointsPerSet) return false;
  return validatePointsSet(set.teamA, set.teamB, rules).ok;
};

export const isLiveScoringInputLocked = (sets: SetResult[], activeSetIndex: number, rules: ScoringRules): boolean => {
  if (isLiveMatchCompleteForScoring(sets, rules)) return true;
  return isOfficialPointsBallBudgetExhausted(sets, activeSetIndex, rules);
};
