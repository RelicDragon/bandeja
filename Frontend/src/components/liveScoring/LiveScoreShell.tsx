import { useMemo } from 'react';
import type { BasicUser } from '@/types';
import type { LiveScoringState, LiveTeamSide } from '@/utils/liveScoring';
import {
  activeSetScore,
  computeServeGuideSnapshot,
  getClassicPointLabels,
  needsServeSetup,
} from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import { isClassicRules } from '@/utils/scoring';
import type { LiveBoardTheme } from '@/utils/liveScoring';
import { AnimatedLiveBoardValue } from './AnimatedLiveBoardValue';
import { LiveBandejaRotatingLogo } from './LiveBandejaRotatingLogo';
import { LiveBroadcastBoard } from './LiveBroadcastBoard';
import { LiveScoreCenter } from './LiveScoreCenter';
import { LiveTeamPanel } from './LiveTeamPanel';

type LiveScoreShellProps = {
  state: LiveScoringState;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  revision: number;
  rules: ScoringRules;
  boardTheme?: LiveBoardTheme;
  tv?: boolean;
  broadcast?: boolean;
  saving?: boolean;
  error?: string | null;
  /** Network; when true and not saving, sync status tag is hidden (header already shows Live). */
  isOnline?: boolean;
  onScore: (side: LiveTeamSide) => void;
  onUndo: (side: LiveTeamSide) => void;
  onServeSetupComplete: (side: LiveTeamSide, doublesPlayerIndex: number) => void;
  onSkipServeGuide: () => void;
};

export const LiveScoreShell = ({
  state,
  teamAPlayers,
  teamBPlayers,
  revision,
  rules,
  boardTheme = 'dark',
  tv,
  broadcast,
  saving,
  error,
  isOnline,
  onScore,
  onUndo,
  onServeSetupComplete,
  onSkipServeGuide,
}: LiveScoreShellProps) => {
  const set = activeSetScore(state);
  const points = getClassicPointLabels(state.classic);
  const setupBlocks = isClassicRules(rules) && needsServeSetup(state, rules);
  const panelDisabled = Boolean(saving || setupBlocks);

  const rosterNames = (players: BasicUser[]) =>
    players.map((p) => [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id);
  const teamANameList = useMemo(() => rosterNames(teamAPlayers), [teamAPlayers]);
  const teamBNameList = useMemo(() => rosterNames(teamBPlayers), [teamBPlayers]);
  const serveIndicator = useMemo(() => {
    if (setupBlocks) return null;
    const snap = computeServeGuideSnapshot(state, rules, teamANameList, teamBNameList);
    if (!snap) return null;
    return { serverTeam: snap.serverTeam, serverPlayerIndex: snap.serverPlayerIndex };
  }, [setupBlocks, state, rules, teamANameList, teamBNameList]);

  if (broadcast) {
    return (
      <LiveBroadcastBoard
        state={state}
        teamAPlayers={teamAPlayers}
        teamBPlayers={teamBPlayers}
        revision={revision}
        boardTheme={boardTheme}
        serveIndicator={serveIndicator}
      />
    );
  }

  if (tv) {
    void revision;
    return (
      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto_1fr] gap-4 p-4 md:grid-cols-[1fr_auto_1fr] md:grid-rows-1">
        <LiveTeamPanel
          side="teamA"
          players={teamAPlayers}
          games={set.teamA}
          point={state.mode === 'classic' ? points.teamA : undefined}
          tv
          boardTheme={boardTheme}
          serveIndicator={serveIndicator}
        />
        <div className="flex min-h-0 h-full min-w-0 flex-col items-center px-4 text-center md:min-h-[12rem]">
          <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
            <div
              className={
                boardTheme === 'light'
                  ? 'text-sm uppercase tracking-[0.4em] text-gray-500'
                  : 'text-sm uppercase tracking-[0.4em] text-white/50'
              }
            >
              Set <AnimatedLiveBoardValue value={state.activeSetIndex + 1} className="tabular-nums" />
            </div>
            <div
              className={
                boardTheme === 'light'
                  ? 'mt-4 text-[clamp(2rem,7vw,7rem)] font-black leading-none text-gray-900'
                  : 'mt-4 text-[clamp(2rem,7vw,7rem)] font-black leading-none'
              }
            >
              {state.mode === 'classic' ? (
                <AnimatedLiveBoardValue value={points.center || 'Live'} intensity="impact" />
              ) : (
                'Live'
              )}
            </div>
          </div>
          <div className="mt-6 shrink-0 opacity-95">
            <LiveBandejaRotatingLogo variant="tv" alt="" />
          </div>
        </div>
        <LiveTeamPanel
          side="teamB"
          players={teamBPlayers}
          games={set.teamB}
          point={state.mode === 'classic' ? points.teamB : undefined}
          tv
          boardTheme={boardTheme}
          serveIndicator={serveIndicator}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-auto p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <LiveBroadcastBoard
        state={state}
        teamAPlayers={teamAPlayers}
        teamBPlayers={teamBPlayers}
        revision={revision}
        boardTheme={boardTheme}
        serveIndicator={serveIndicator}
        interactive
        disabled={panelDisabled}
        onScore={onScore}
        onUndo={onUndo}
      />
      <LiveScoreCenter
        state={state}
        teamAPlayers={teamAPlayers}
        teamBPlayers={teamBPlayers}
        pointCenter={points.center}
        rules={rules}
        saving={saving}
        error={error}
        isOnline={isOnline ?? true}
        onServeSetupComplete={onServeSetupComplete}
        onSkipServeGuide={onSkipServeGuide}
        showPointHeadline={false}
      />
    </div>
  );
};
