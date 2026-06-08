import { isLiveScoringInputLocked } from '@/utils/scoring/matchWinner';
import { activeSetScore, optionalDeciderChoicePending } from '@/utils/liveScoring';
import { isLetReplayBlockingScore, validateStrictBadmintonServeBeforePoint } from '@shared/officiatingEnforcement';
import { officiatingIsStrict } from '@shared/officiatingLevel';
import { resolveLiveScoringPlugin, computeServeGuideSnapshotByPlugin } from '@/liveScoring/registry';
import { liveScoringClosedByMatchMetadata } from './liveScoringClosed';
import type { CanScoreResult, ScorePointContext } from './types';
import type { LiveScoringState, LiveTeamSide } from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import type { RawMatch } from '@/hooks/useLiveMatchBoardState';

function playerNames(players: ScorePointContext['teamAPlayers']): string[] {
  return players.map((p) => [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id);
}

export function canScoreLivePoint(
  liveState: LiveScoringState | null,
  rules: ScoringRules | null,
  rawMatch: RawMatch | null,
  ctx: ScorePointContext,
  team: LiveTeamSide,
  saving: boolean,
  isAuthenticated: boolean
): CanScoreResult {
  if (!liveState || !rules || saving || !isAuthenticated) {
    return { ok: false, reason: 'blocked' };
  }
  if (liveScoringClosedByMatchMetadata(rawMatch?.metadata)) {
    return { ok: false, reason: 'closed' };
  }
  if (optionalDeciderChoicePending(liveState, rules)) {
    return { ok: false, reason: 'decider' };
  }
  if (isLiveScoringInputLocked(liveState.sets, liveState.activeSetIndex, rules)) {
    return { ok: false, reason: 'locked' };
  }
  if (isLetReplayBlockingScore(liveState, rules.officiatingLevel)) {
    return {
      ok: false,
      reason: 'let',
      toastKey: 'gameDetails.liveScoring.strictLetPending',
    };
  }
  if (officiatingIsStrict(rules.officiatingLevel) && ctx.game?.sport === 'BADMINTON') {
    const plugin = resolveLiveScoringPlugin(
      ctx.game.sport,
      ctx.game.scoringPreset ?? rules.preset,
      ctx.game.metadata
    );
    const snap = computeServeGuideSnapshotByPlugin(
      plugin,
      liveState,
      rules,
      playerNames(ctx.teamAPlayers),
      playerNames(ctx.teamBPlayers),
      ctx.playersPerMatch
    );
    if (snap?.courtSide) {
      const set = activeSetScore(liveState);
      const serverScore = snap.serverTeam === 'teamA' ? set.teamA : set.teamB;
      const check = validateStrictBadmintonServeBeforePoint({
        level: rules.officiatingLevel,
        sport: ctx.game.sport,
        serverScore,
        courtSide: snap.courtSide,
      });
      if (!check.ok) {
        return {
          ok: false,
          reason: 'serve',
          toastKey: 'gameDetails.liveScoring.strictServeSideMismatch',
        };
      }
    }
  }
  void team;
  return { ok: true };
}
