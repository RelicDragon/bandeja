import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import type { LiveMatchCourtOrientation, LivePointsServeRotation, LiveScoringState, LiveTeamSide } from '@/utils/liveScoring';
import {
  activeSetScore,
  getClassicPointLabels,
  liveSetLabelForRow,
  needsPointsServeRotationChoice,
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
import {
  computeServeGuideSnapshotByPlugin,
  isRallyLiveScoringPlugin,
  liveScoringOfficiatingHintsEnabled,
  liveScoringOfficiatingStrictEnabled,
  liveScoringServeGuideEnabled,
  needsServeSetupForPlugin,
  resolveLiveScoringPlugin,
} from '@/liveScoring/registry';
import type { OfficiatingLevel } from '@shared/officiatingLevel';
import type { ScoringPreset, Sport } from '@/types';
import { RallyOfficiatingButtons } from './rally/RallyOfficiatingButtons';
import { liveCourtAspectForUiId, resolveCourtSchemaComponent, resolveRallyCourtForPlugin } from './courtRegistry';
import { RallyScoreBoard } from './rally/RallyScoreBoard';
import { rallyScoreMetaForState } from '@/liveScoring/rallyScoreMeta';

type LiveScoreShellProps = {
  state: LiveScoringState;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  revision: number;
  rules: ScoringRules;
  gameId?: string;
  boardTheme?: LiveBoardTheme;
  tv?: boolean;
  broadcast?: boolean;
  saving?: boolean;
  error?: string | null;
  statusNote?: string | null;
  scoringLocked?: boolean;
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
  sport?: Sport | string | null;
  scoringPreset?: ScoringPreset | null;
  playersPerMatch?: number;
  gameMetadata?: unknown;
  officiatingLetPending?: boolean;
  onKitchenFault?: (faultingTeam: LiveTeamSide) => void;
  onLet?: () => void;
  onLetReplay?: () => void;
  onServiceFault?: () => void;
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
  sport,
  scoringPreset,
  playersPerMatch = 4,
  gameMetadata,
  officiatingLetPending,
  onKitchenFault,
  onLet,
  onLetReplay,
  onServiceFault,
}: LiveScoreShellProps) => {
  const { t } = useTranslation();
  const set = activeSetScore(state);
  const points = getClassicPointLabels(state.classic, rules);
  const liveScoringPlugin = useMemo(
    () =>
      resolveLiveScoringPlugin(sport, (scoringPreset ?? rules.preset) as ScoringPreset | 'DERIVED', gameMetadata),
    [sport, scoringPreset, rules.preset, gameMetadata],
  );
  const officiatingLevel: OfficiatingLevel = liveScoringPlugin.officiatingLevel;
  const isRally = isRallyLiveScoringPlugin(liveScoringPlugin);
  const matchDoubles = playersPerMatch === 4;
  const serveGuideEnabled = liveScoringServeGuideEnabled(sport, liveScoringPlugin, rules);
  const officiatingHintsEnabled = liveScoringOfficiatingHintsEnabled(liveScoringPlugin);
  const officiatingStrictEnabled = liveScoringOfficiatingStrictEnabled(liveScoringPlugin);
  const setupBlocks = needsServeSetupForPlugin(liveScoringPlugin, state, rules);
  const showServeRotationRules =
    needsPointsServeRotationChoice(state, rules) &&
    serveGuideEnabled &&
    sport !== 'TABLE_TENNIS' &&
    sport !== 'BADMINTON' &&
    sport !== 'SQUASH' &&
    sport !== 'PICKLEBALL';
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
  const CourtSchemaComponent = useMemo(
    () => resolveCourtSchemaComponent(liveScoringPlugin.uiId),
    [liveScoringPlugin.uiId]
  );
  const RallyCourtComponent = useMemo(
    () => resolveRallyCourtForPlugin(liveScoringPlugin),
    [liveScoringPlugin]
  );
  const serveGuideSnapshot = useMemo(() => {
    if (setupBlocks || !serveGuideEnabled) return null;
    return computeServeGuideSnapshotByPlugin(
      liveScoringPlugin,
      state,
      rules,
      teamANameList,
      teamBNameList,
      playersPerMatch
    );
  }, [setupBlocks, serveGuideEnabled, liveScoringPlugin, state, rules, teamANameList, teamBNameList, playersPerMatch]);
  const rallyMeta = useMemo(() => rallyScoreMetaForState(state, rules), [state, rules]);

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
        sport={sport}
      />
    );
  }

  if (tv) {
    void revision;
    const rallyCenter =
      isRally && RallyCourtComponent ? (
        <RallyScoreBoard
          CourtComponent={RallyCourtComponent}
          teamAPlayers={teamAPlayers}
          teamBPlayers={teamBPlayers}
          teamAScore={set.teamA}
          teamBScore={set.teamB}
          matchDoubles={matchDoubles}
          serverTeam={serveGuideSnapshot?.serverTeam}
          serverPlayerIndex={serveGuideSnapshot?.serverPlayerIndex}
          courtSide={serveGuideSnapshot?.courtSide}
          courtEndsSwapped={serveGuideSnapshot?.courtEndsSwapped}
          motionToken={serveGuideSnapshot?.motionToken}
          setChips={rallyMeta.setChips}
          setsWon={rallyMeta.setsWon}
          gameCap={rallyMeta.gameCap}
          gameLabel={rallyMeta.gameLabel}
          changeEndsBeforeNextPoint={serveGuideSnapshot?.changeEndsBeforeNextPoint}
        />
      ) : null;
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
          sport={sport}
        />
        <div className="flex min-h-0 h-full min-w-0 flex-col items-center px-4 text-center md:min-h-[12rem]">
          {rallyCenter ?? (
            <>
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
            </>
          )}
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
          sport={sport}
        />
      </div>
    );
  }

  const showShareUrls = shareTvUrl !== undefined || shareBroadcastUrl !== undefined;
  const showServeLine = Boolean(serveGuideSnapshot && !matchDecided);
  const scorePanelShellClass = showServeLine
    ? boardTheme === 'light'
      ? 'rounded-xl border border-zinc-200 bg-white shadow-sm'
      : 'rounded-xl border border-zinc-700/90 bg-zinc-900 shadow-md'
    : '';

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-stretch">
      <div
        className={`flex min-h-0 w-full min-w-0 flex-1 flex-col items-center gap-2 px-3 pb-2 pt-3 ${
          setupBlocks && !matchDecided ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'
        }`}
      >
        {setupBlocks && !matchDecided ? (
          <div className="relative z-40 w-full max-w-lg touch-manipulation">
            <LiveServeSetupCard
              teamAPlayers={teamAPlayers}
              teamBPlayers={teamBPlayers}
              CourtSchemaComponent={CourtSchemaComponent}
              courtAspect={liveCourtAspectForUiId(liveScoringPlugin.uiId)}
              matchDoubles={matchDoubles}
              courtSetupLayout={sport === 'SQUASH' ? 'sides' : 'ends'}
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
          <div className={`flex w-fit max-w-full min-w-0 flex-col ${scorePanelShellClass}`}>
            <LiveBroadcastBoard
              state={state}
              rules={rules}
              teamAPlayers={teamAPlayers}
              teamBPlayers={teamBPlayers}
              revision={revision}
              boardTheme={boardTheme}
              serveIndicator={serveIndicator}
              sport={sport}
              interactive={!setupBlocks}
              disabled={panelDisabled}
              attachedFooter={showServeLine}
              embedded={showServeLine}
              onScore={onScore}
              onUndo={onUndo}
            />
            {showServeLine && serveGuideSnapshot ? (
              <LiveServeServerLine
                attached
                snapshot={serveGuideSnapshot}
                teamAPlayers={teamAPlayers}
                teamBPlayers={teamBPlayers}
              />
            ) : null}
          </div>
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
        {!setupBlocks ? (
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
          <LiveScoreCenter
            state={state}
            teamAPlayers={teamAPlayers}
            teamBPlayers={teamBPlayers}
            CourtSchemaComponent={CourtSchemaComponent}
            matchDoubles={matchDoubles}
            serveGuideSnapshot={serveGuideSnapshot}
            rules={rules}
            saving={saving}
            error={error}
            statusNote={matchDecided ? null : statusNote}
            isOnline={isOnline ?? true}
            hideServeGuide={matchDecided || !serveGuideEnabled}
            RallyCourtComponent={RallyCourtComponent}
            courtAspect={liveCourtAspectForUiId(liveScoringPlugin.uiId)}
            onServeSetupComplete={onServeSetupComplete}
            onSkipServeGuide={onSkipServeGuide}
            sport={sport}
            officiatingLevel={officiatingLevel}
            officiatingHintsEnabled={officiatingHintsEnabled}
            letPending={officiatingLetPending}
            onKitchenFault={onKitchenFault}
            onLet={onLet}
            onLetReplay={onLetReplay}
            onServiceFault={onServiceFault}
          />
          </div>
        ) : null}
        {!setupBlocks && !isRally && sport === 'TENNIS' && (officiatingHintsEnabled || officiatingStrictEnabled) ? (
          <div className="mt-2 flex justify-center">
            <RallyOfficiatingButtons
              level={officiatingLevel}
              letPending={officiatingLetPending}
              onLet={onLet}
              onLetReplay={onLetReplay}
              onServiceFault={onServiceFault}
            />
          </div>
        ) : null}
      </div>
      {showShareUrls ? (
        <LiveScoringUrlButtons tvUrl={shareTvUrl ?? ''} broadcastUrl={shareBroadcastUrl ?? ''} />
      ) : null}
    </div>
  );
};
