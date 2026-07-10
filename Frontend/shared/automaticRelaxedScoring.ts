export const AUTOMATIC_RECORD_MODE_METADATA_KEY = 'automaticRecordMode';

export type AutomaticMatchRecordMode = 'GAMES' | 'AMERICANO_POINTS';

export type AutomaticSetEntryMode = AutomaticMatchRecordMode | 'SUPER_TIEBREAK';

export type AutomaticSetScoringKind = 'GAMES' | 'AMERICANO_POINTS' | 'SUPER_TIEBREAK';

export interface AutomaticRelaxedRulesLike {
  strictValidation?: string;
  superTieBreakReplacesDeciderAtIndex?: number | null;
}

export interface AutomaticRelaxedSetLike {
  teamAScore?: number;
  teamBScore?: number;
  teamA?: number;
  teamB?: number;
  isTieBreak?: boolean | null;
}

export interface RatingSetScore {
  teamAScore: number;
  teamBScore: number;
  isTieBreak?: boolean;
  automaticSetKind?: AutomaticSetScoringKind | null;
}

function teamAScoreOf(set: AutomaticRelaxedSetLike): number {
  return set.teamAScore ?? set.teamA ?? 0;
}

function teamBScoreOf(set: AutomaticRelaxedSetLike): number {
  return set.teamBScore ?? set.teamB ?? 0;
}

function isSetPlayed(set: AutomaticRelaxedSetLike): boolean {
  return teamAScoreOf(set) > 0 || teamBScoreOf(set) > 0;
}

export function isAutomaticRelaxedRules(rules: AutomaticRelaxedRulesLike): boolean {
  return rules.strictValidation === 'CLASSIC_AUTOMATIC_RELAXED';
}

export function parseAutomaticMatchRecordMode(
  metadata?: Record<string, unknown> | null,
): AutomaticMatchRecordMode {
  const raw = metadata?.[AUTOMATIC_RECORD_MODE_METADATA_KEY];
  return raw === 'AMERICANO_POINTS' ? 'AMERICANO_POINTS' : 'GAMES';
}

export function mergeAutomaticMatchRecordMetadata(
  metadata: Record<string, unknown> | undefined,
  mode: AutomaticMatchRecordMode,
): Record<string, unknown> {
  return { ...(metadata ?? {}), [AUTOMATIC_RECORD_MODE_METADATA_KEY]: mode };
}

export function countAutomaticSetsWon(sets: AutomaticRelaxedSetLike[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const set of sets) {
    if (!isSetPlayed(set)) continue;
    const sa = teamAScoreOf(set);
    const sb = teamBScoreOf(set);
    if (sa > sb) a += 1;
    else if (sb > sa) b += 1;
  }
  return { a, b };
}

export function canUseSuperTiebreakEntry(
  setIndex: number,
  sets: AutomaticRelaxedSetLike[],
  rules: AutomaticRelaxedRulesLike,
): boolean {
  if (!isAutomaticRelaxedRules(rules)) return false;
  const prior = sets.slice(0, setIndex).filter(isSetPlayed);
  const { a, b } = countAutomaticSetsWon(prior);
  return a === b && a > 0;
}

export function resolveAutomaticSetScoringKind(
  setIndex: number,
  sets: AutomaticRelaxedSetLike[],
  matchMetadata: Record<string, unknown> | null | undefined,
  rules: AutomaticRelaxedRulesLike,
): AutomaticSetScoringKind | null {
  if (!isAutomaticRelaxedRules(rules)) return null;
  const set = sets[setIndex];
  if (set?.isTieBreak) return 'SUPER_TIEBREAK';
  return parseAutomaticMatchRecordMode(matchMetadata) === 'AMERICANO_POINTS'
    ? 'AMERICANO_POINTS'
    : 'GAMES';
}

export function toRatingSetScores(
  sets: Array<{ teamAScore: number; teamBScore: number; isTieBreak?: boolean | null }>,
  matchMetadata: Record<string, unknown> | null | undefined,
  rules: AutomaticRelaxedRulesLike,
): RatingSetScore[] {
  return sets.map((set, index) => ({
    teamAScore: set.teamAScore,
    teamBScore: set.teamBScore,
    isTieBreak: set.isTieBreak || undefined,
    automaticSetKind: resolveAutomaticSetScoringKind(index, sets, matchMetadata, rules),
  }));
}

export function ratingSetUsesGamesMargin(
  set: Pick<RatingSetScore, 'isTieBreak' | 'automaticSetKind'>,
  ballsInGames: boolean,
): boolean {
  if (set.automaticSetKind === 'AMERICANO_POINTS' || set.automaticSetKind === 'SUPER_TIEBREAK') {
    return false;
  }
  if (set.automaticSetKind === 'GAMES') {
    return ballsInGames;
  }
  return ballsInGames && !set.isTieBreak;
}

export function ratingSetUsesTiebreakMargin(set: Pick<RatingSetScore, 'isTieBreak' | 'automaticSetKind'>): boolean {
  return !!set.isTieBreak || set.automaticSetKind === 'SUPER_TIEBREAK';
}
