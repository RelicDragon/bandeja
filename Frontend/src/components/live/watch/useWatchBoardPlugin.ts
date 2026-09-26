import { useMemo } from 'react';
import type { BasicUser, ScoringPreset, Sport } from '@/types';
import type { LiveScoringState } from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import {
  computeServeGuideSnapshotByPlugin,
  isRallyLiveScoringPlugin,
  liveScoringServeGuideEnabled,
  needsServeSetupForPlugin,
  resolveLiveScoringPlugin,
} from '@/liveScoring/registry';
import type { LiveServeIndicator } from '@/components/liveScoring/LiveTeamPanel';

type Args = {
  state: LiveScoringState | null;
  rules: ScoringRules;
  sport?: Sport | string | null;
  scoringPreset?: ScoringPreset | null;
  gameMetadata?: unknown;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  playersPerMatch: number;
};

const nameOf = (p: BasicUser) => [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;

/**
 * Which board the watch page draws, and who is serving. Rally sports keep the
 * shared `LiveScoreShell` board; padel / tennis get the spectator stage. The
 * serve indicator is derived exactly as `LiveScoreShell` does for its boards.
 */
export function useWatchBoardPlugin({
  state,
  rules,
  sport,
  scoringPreset,
  gameMetadata,
  teamAPlayers,
  teamBPlayers,
  playersPerMatch,
}: Args): { isRally: boolean; serveIndicator: LiveServeIndicator | null } {
  const plugin = useMemo(
    () => resolveLiveScoringPlugin(sport, (scoringPreset ?? rules.preset) as ScoringPreset | 'DERIVED', gameMetadata),
    [sport, scoringPreset, rules.preset, gameMetadata],
  );

  const serveIndicator = useMemo((): LiveServeIndicator | null => {
    if (!state || !liveScoringServeGuideEnabled(sport, plugin, rules)) return null;
    if (needsServeSetupForPlugin(plugin, state, rules)) return null;
    const snapshot = computeServeGuideSnapshotByPlugin(
      plugin,
      state,
      rules,
      teamAPlayers.map(nameOf),
      teamBPlayers.map(nameOf),
      playersPerMatch,
    );
    return snapshot ? { serverTeam: snapshot.serverTeam, serverPlayerIndex: snapshot.serverPlayerIndex } : null;
  }, [state, sport, plugin, rules, teamAPlayers, teamBPlayers, playersPerMatch]);

  return { isRally: isRallyLiveScoringPlugin(plugin), serveIndicator };
}
