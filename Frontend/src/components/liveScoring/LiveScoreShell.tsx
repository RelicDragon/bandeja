import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import type { LiveMatchCourtOrientation, LivePointsServeRotation, LiveScoringState, LiveTeamSide } from '@/utils/liveScoring';
import {
  activeSetScore,
  computeServeGuideSnapshot,
  getClassicPointLabels,
  liveSetLabelForRow,
  needsPointsServeRotationChoice,
  needsServeSetup,
} from '@/utils/liveScoring';
import { LiveServeSetupCard } from './LiveServeSetupCard';
import { LiveServeServerLine } from './LiveServeServerLine';
import type { ScoringRules } from '@/utils/scoring';
import { isLiveMatchCompleteForScoring } from '@/utils/scoring';
import type { LiveBoardTheme } from '@/utils/liveScoring';
import { AnimatedLiveBoardValue } from './AnimatedLiveBoardValue';
import { LiveBandejaRotatingLogo } from './LiveBandejaRotatingLogo';
import { LiveBroadcastBoard } from './LiveBroadcastBoard';
import { LiveMatchCompleteBanner } from './LiveMatchCompleteBanner';
import { LiveScoreCenter } from './LiveScoreCenter';
import { LiveScoringUrlButtons } from './LiveScoringUrlButtons';
import { LiveTeamPanel } from './LiveTeamPanel';

type LiveScoreShellProps = {
  state: LiveScoringState;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  revision: number;
  rules: ScoringRules;
  /** Used to deep-link to game results once match is decided. */
  gameId?: string;
  boardTheme?: LiveBoardTheme;
  tv?: boolean;
  broadcast?: boolean;
  saving?: boolean;
  error?: string | null;
  statusNote?: string | null;
  /** When true, score / undo controls are disabled (match decided, points cap, etc.). */
  scoringLocked?: boolean;
  /** Network; when true and not saving, sync status tag is hidden (header already shows Live). */
  isOnline?: boolean;
  onScore: (side: LiveTeamSide) => void;
  onUndo: (side: LiveTeamSide) => void;
  onServeSetupComplete: (
    side: LiveTeamSide,
    doublesPlayerIndex: number,
    rotation: LivePointsServeRotation,
    courtOrientation: LiveMatchCourtOrientation
  ) => void;
  onSkipServeGuide: () => void;
  shareTvUrl?: string;
  shareBroadcastUrl?: string;
};

export const LiveScoreShell = ({
  state,
  teamAPlayers,
  teamBPlayers,
  revision,
  rules,
  gameId = '',
  boardTheme = 'dark',
  tv,
  broadcast,
  saving,
  error,
  statusNote,
  scoringLocked,
  isOnline,
  onScore,
  onUndo,
  onServeSetupComplete,
  onSkipServeGuide,
  shareTvUrl,
  shareBroadcastUrl,
}: LiveScoreShellProps) => {
  const { t } = useTranslation();
  const set = activeSetScore(state);
  const points = getClassicPointLabels(state.classic, rules);
  const setupBlocks = needsServeSetup(state, rules);
  const showServeRotationRules = needsPointsServeRotationChoice(state, rules);
  const matchDecided = isLiveMatchCompleteForScoring(state.sets, rules);
  const panelDisabled = Boolean(saving || setupBlocks || scoringLocked);
  const activeSetLabel = useMemo(() => liveSetLabelForRow(set, state.activeSetIndex, rules), [
    set,
    state.activeSetIndex,
    rules,
  ]);
  const tvSetTitle = useMemo(() => {
    if (activeSetLabel.kind === 'SUPER_TIE_BREAK') return t('gameDetails.liveScoring.superTieBreakShort');
    if (activeSetLabel.kind === 'TIE_BREAK') {
      return `${t('gameDetails.liveScoring.setN', { n: activeSetLabel.setOneBased })} · ${t('gameDetails.liveScoring.tieBreakShort')}`;
    }
    return t('gameDetails.liveScoring.setN', { n: activeSetLabel.setOneBased });
  }, [activeSetLabel, t]);

  const rosterNames = (players: BasicUser[]) =>
    players.map((p) => [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id);
  const teamANameList = useMemo(() => rosterNames(teamAPlayers), [teamAPlayers]);
  const teamBNameList = useMemo(() => rosterNames(teamBPlayers), [teamBPlayers]);
  const serveGuideSnapshot = useMemo(() => {
    if (setupBlocks) return null;
    return computeServeGuideSnapshot(state, rules, teamANameList, teamBNameList);
  }, [setupBlocks, state, rules, teamANameList, teamBNameList]);
  const serveIndicator = useMemo(() => {
    if (!serveGuideSnapshot) return null;
    return {
      serverTeam: serveGuideSnapshot.serverTeam,
      serverPlayerIndex: serveGuideSnapshot.serverPlayerIndex,
    };
  }, [serveGuideSnapshot]);

  if (broadcast) {
    return (
      <LiveBroadcastBoard
        state={state}
        rules={rules}
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
              <AnimatedLiveBoardValue value={tvSetTitle} className="tabular-nums" />
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

  const showShareUrls = shareTvUrl !== undefined || shareBroadcastUrl !== undefined;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-stretch">
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-auto p-3 pb-3">
        {setupBlocks && !matchDecided ? (
          <div className="relative z-40 w-full max-w-lg shrink-0 touch-manipulation">
            <LiveServeSetupCard
              teamAPlayers={teamAPlayers}
              teamBPlayers={teamBPlayers}
              showServeRotationRules={showServeRotationRules}
              saving={saving}
              onComplete={onServeSetupComplete}
              onSkipHints={onSkipServeGuide}
            />
          </div>
        ) : null}
        <div
          className={`flex w-full shrink-0 justify-center ${setupBlocks ? 'hidden' : ''}`}
          aria-hidden={setupBlocks || undefined}
        >
          <LiveBroadcastBoard
            state={state}
            rules={rules}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            revision={revision}
            boardTheme={boardTheme}
            serveIndicator={serveIndicator}
            interactive={!setupBlocks}
            disabled={panelDisabled}
            onScore={onScore}
            onUndo={onUndo}
          />
        </div>
        {matchDecided ? (
          <LiveMatchCompleteBanner
            state={state}
            rules={rules}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            gameId={gameId}
          />
        ) : null}
        {serveGuideSnapshot && !matchDecided ? (
          <LiveServeServerLine
            snapshot={serveGuideSnapshot}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
          />
        ) : null}
        {!setupBlocks ? (
          <LiveScoreCenter
            state={state}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            pointCenter={points.center}
            rules={rules}
            saving={saving}
            error={error}
            statusNote={matchDecided ? null : statusNote}
            isOnline={isOnline ?? true}
            hideServeGuide={matchDecided}
            onServeSetupComplete={onServeSetupComplete}
            onSkipServeGuide={onSkipServeGuide}
            showPointHeadline={false}
          />
        ) : null}
      </div>
      {showShareUrls ? (
        <LiveScoringUrlButtons tvUrl={shareTvUrl ?? ''} broadcastUrl={shareBroadcastUrl ?? ''} />
      ) : null}
    </div>
  );
};
