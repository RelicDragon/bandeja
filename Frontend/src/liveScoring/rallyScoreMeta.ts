import type { RallySetChip } from '@/components/liveScoring/rally/RallyScoreBoard';
import type { LiveScoringState } from '@/utils/liveScoring';
import { isRallyGameRules, type ScoringRules } from '@/utils/scoring';

export type RallyScoreMeta = {
  setChips?: RallySetChip[];
  setsWon?: { teamA: number; teamB: number };
  gameCap?: number;
  gameLabel?: string;
};

function setsWonCount(state: LiveScoringState, rules: ScoringRules): { teamA: number; teamB: number } {
  let teamA = 0;
  let teamB = 0;
  const cap = rules.totalPointsPerSet;
  const winBy = rules.winBy;
  for (let i = 0; i < state.sets.length; i += 1) {
    if (i === state.activeSetIndex) continue;
    const row = state.sets[i];
    if (!row) continue;
    const a = row.teamA ?? 0;
    const b = row.teamB ?? 0;
    const leader = Math.max(a, b);
    const trailer = Math.min(a, b);
    if (leader < cap || leader - trailer < winBy) continue;
    if (a > b) teamA += 1;
    else if (b > a) teamB += 1;
  }
  return { teamA, teamB };
}

export function rallyScoreMetaForState(state: LiveScoringState, rules: ScoringRules): RallyScoreMeta {
  const cap = rules.totalPointsPerSet;
  if (isRallyGameRules(rules)) {
    const setChips: RallySetChip[] = state.sets.map((row, i) => ({
      teamA: row?.teamA ?? 0,
      teamB: row?.teamB ?? 0,
      isActive: i === state.activeSetIndex,
    }));
    return {
      setChips,
      setsWon: setsWonCount(state, rules),
      gameCap: cap > 0 ? cap : undefined,
    };
  }
  if (cap > 0 && rules.fixedNumberOfSets <= 1) {
    return { gameCap: cap };
  }
  return {};
}
