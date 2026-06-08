import { clearLetPending } from '@shared/officiatingEnforcement';
import { scoreLivePoint, type LiveScoringActionResult, type LiveScoringState, type LiveTeamSide } from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';

export function buildScorePointMutation(
  liveState: LiveScoringState,
  team: LiveTeamSide,
  rules: ScoringRules
): LiveScoringActionResult {
  const result = scoreLivePoint(liveState, team, rules);
  return result.changed ? { ...result, state: clearLetPending(result.state) } : result;
}
