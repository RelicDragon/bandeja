import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, PenLine, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { PlayerAvatar } from '@/components';
import { Match } from '@/types/gameResults';
import { BasicUser, Court, Game } from '@/types';
import {
  expandSetsForDisplay,
  getResultsMatchResolvedWinnerTeam,
  getRules,
  isResultsMatchFinished,
  isResultsMatchInProgressForResultsHeader,
  matchSetsHaveAnyNonZeroScore,
} from '@/utils/scoring';
import { isSupplementalMatchSet } from '@/utils/matchSetRole';
import { maxPlayersPerTeamForGame } from '@/utils/matchFormat';
import { formatFixtureMatrixPlayerName } from '@/utils/leagueFixtureMatrix';
import { nextEntrySetIndex } from '@/utils/resultsBoardNavigation';
import { SetScoreTile } from '@/components/gameResults/SetScoreTile';
import { getSetScoreTileState } from '@/components/gameResults/setScoreTileState';
import { MatchResultsHeaderBadges } from '@/components/gameResults/MatchResultsHeaderBadges';
import { MatchTimerPanel } from '@/components/gameResults/matchTimer/MatchTimerPanel';
import {
  LivePlayLink,
  MatchEditDoneButton,
} from '@/components/gameResults/MatchCardControls';
import { useMatchCardActions } from '@/components/gameResults/useMatchCardActions';
import type { MatchTimerAction } from '@/utils/matchTimer';

interface HorizontalMatchCardProps {
  match: Match;
  matchIndex: number;
  players: BasicUser[];
  isEditing: boolean;
  canEditResults: boolean;
  draggedPlayer: string | null;
  showHeaderEditButton: boolean;
  showDeleteButton: boolean;
  onRemoveMatch: () => void;
  onMatchClick: () => void;
  onCancelMatchEdit: () => void;
  onSetClick: (setIndex: number) => void;
  onRemovePlayer: (team: 'teamA' | 'teamB', playerId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, team: 'teamA' | 'teamB') => void;
  onPlayerPlaceholderClick: (team: 'teamA' | 'teamB') => void;
  canEnterResults: boolean;
  showCourtLabel?: boolean;
  selectedCourt?: Court | null;
  courts?: Court[];
  onCourtClick?: () => void;
  fixedNumberOfSets?: number;
  game?: Pick<Game, 'scoringPreset' | 'matchTimedCapMinutes' | 'matchTimerEnabled' | 'fixedNumberOfSets' | 'maxTotalPointsPerSet' | 'maxPointsPerTeam' | 'winnerOfMatch' | 'ballsInGames' | 'deucesBeforeGoldenPoint' | 'pointsPerTie' | 'resultsStatus' | 'playersPerMatch' | 'sport'> | null;
  roundId?: string;
  gameId?: string;
  onMatchTimerTransition?: (roundId: string, matchId: string, action: MatchTimerAction) => void | Promise<void>;
  onAddSupplementalSet?: () => void;
  onEditLineup?: () => void;
  onPlayerTap?: (team: 'teamA' | 'teamB', playerId: string) => void;
  lineupTargetTeam?: 'teamA' | 'teamB' | null;
}

export const HorizontalMatchCard = ({
  match,
  matchIndex,
  players,
  isEditing,
  canEditResults,
  draggedPlayer,
  showHeaderEditButton,
  showDeleteButton,
  onRemoveMatch,
  onMatchClick,
  onCancelMatchEdit,
  onSetClick,
  onRemovePlayer,
  onDragOver,
  onDrop,
  onPlayerPlaceholderClick,
  canEnterResults,
  showCourtLabel = false,
  selectedCourt,
  onCourtClick,
  fixedNumberOfSets,
  game,
  roundId,
  gameId,
  onMatchTimerTransition,
  onAddSupplementalSet,
  onEditLineup,
  onPlayerTap,
  lineupTargetTeam = null,
}: HorizontalMatchCardProps) => {
  const { t } = useTranslation();
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const rules = getRules(game ?? { fixedNumberOfSets, maxTotalPointsPerSet: 0, maxPointsPerTeam: 0, winnerOfMatch: 'BY_SCORES', ballsInGames: false, deucesBeforeGoldenPoint: null, pointsPerTie: 0, scoringPreset: null } as any);
  const displaySets = expandSetsForDisplay(match.sets, rules, { canEditResults });
  const resultsFinal = game?.resultsStatus === 'FINAL';
  const matchFinished = isResultsMatchFinished(match, rules);
  const matchInProgressHeader = isResultsMatchInProgressForResultsHeader(match, rules);
  const resolvedWinnerTeam = getResultsMatchResolvedWinnerTeam(match, rules);

  const maxPlayersPerTeam = maxPlayersPerTeamForGame(game, players.length);
  const teamSlotsFull = (team: 'teamA' | 'teamB') =>
    Array.from({ length: maxPlayersPerTeam }, (_, i) => Boolean(match[team][i])).every(Boolean);
  const teamsFull = teamSlotsFull('teamA') && teamSlotsFull('teamB');

  const liveGameId =
    gameId && !matchFinished && canEditResults && !isEditing && teamsFull ? gameId : null;
  const showEnterScore =
    canEditResults &&
    canEnterResults &&
    teamsFull &&
    !isEditing &&
    !matchFinished &&
    !matchInProgressHeader &&
    !matchSetsHaveAnyNonZeroScore(match.sets);
  const showScores = canEnterResults && !isEditing && teamsFull && !showEnterScore;
  const showCenterColumn = showScores || showEnterScore || Boolean(liveGameId);
  const lineupEditable = canEditResults && Boolean(onPlayerTap);

  const { menuButton, overlays } = useMatchCardActions({
    matchId: match.id,
    matchIndex,
    isEditing: isEditing && canEditResults,
    courtName: showCourtLabel ? selectedCourt?.name ?? null : null,
    canEditLineup: showHeaderEditButton && canEditResults,
    onEditLineup,
    canChangeCourt: showCourtLabel && canEditResults && Boolean(onCourtClick),
    onChangeCourt: onCourtClick,
    liveGameId,
    canAddExtraSet:
      !isEditing &&
      canEditResults &&
      Boolean(onAddSupplementalSet) &&
      canEnterResults &&
      teamsFull &&
      matchFinished,
    onAddExtraSet: onAddSupplementalSet,
    canDelete: showDeleteButton,
    onDelete: onRemoveMatch,
  });

  if (
    !canEditResults &&
    !matchSetsHaveAnyNonZeroScore(match.sets) &&
    !matchFinished &&
    !matchInProgressHeader
  ) {
    return null;
  }

  const headerTrailing =
    isEditing && canEditResults ? (
      <MatchEditDoneButton label={t('common.done')} onClick={onCancelMatchEdit} />
    ) : (
      menuButton
    );

  const renderTeam = (team: 'teamA' | 'teamB') => {
    const teamPlayers = match[team].slice(0, maxPlayersPerTeam);
    const isWinner = resolvedWinnerTeam === team;
    const isTeamA = team === 'teamA';
    const openSeats = Math.max(0, maxPlayersPerTeam - teamPlayers.length);

    return (
      <div
        data-drop-zone
        data-match-id={match.id}
        data-team={team}
        className={`relative flex min-h-[40px] w-full items-center justify-center px-1 py-1.5 ${
          (isEditing || draggedPlayer) && canEditResults ? 'rounded-xl border-2 border-dashed border-gray-300 transition-colors dark:border-gray-600' : ''
        } ${
          canEditResults && draggedPlayer ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : ''
        } ${
          isWinner
            ? `rounded-xl ring-1 ring-inset ring-emerald-300/60 dark:ring-emerald-700/50 ${
                isTeamA
                  ? 'bg-gradient-to-r from-emerald-100/90 to-transparent dark:from-emerald-900/40 dark:to-transparent'
                  : 'bg-gradient-to-l from-emerald-100/90 to-transparent dark:from-emerald-900/40 dark:to-transparent'
              }`
            : ''
        }`}
        onDragOver={canEditResults ? onDragOver : undefined}
        onDrop={canEditResults ? (e) => onDrop(e, team) : undefined}
      >
        <div className={`flex flex-col gap-1.5 w-full min-w-0 ${isTeamA ? 'items-start justify-center' : 'items-end justify-center'}`}>
          {teamPlayers.map(playerId => {
            const player = players.find(p => p.id === playerId);
            if (!player) return null;
            const fullName = [player.firstName, player.lastName].filter(Boolean).join(' ') || '—';
            const compactName = formatFixtureMatrixPlayerName(player) || fullName;
            const playerName = windowWidth < 640 ? compactName : fullName;
            const avatar = (
              <div className="shrink-0">
                <PlayerAvatar
                  player={player}
                  asDiv={lineupEditable}
                  draggable={false}
                  showName={false}
                  fullHideName={true}
                  extrasmall={true}
                />
              </div>
            );
            const name = (
              <span className={`truncate text-xs font-semibold text-gray-800 dark:text-gray-100 leading-tight ${isTeamA ? 'text-start' : 'text-end'}`}>
                {playerName}
              </span>
            );

            return (
              <div
                key={playerId}
                className={`flex items-center gap-1 min-w-0 max-w-full ${isTeamA ? '' : 'flex-row-reverse text-end'}`}
              >
                {lineupEditable ? (
                  <button
                    type="button"
                    aria-label={fullName}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayerTap?.(team, playerId);
                    }}
                    className={`flex min-h-[32px] min-w-0 items-center gap-1.5 rounded-md transition-opacity active:opacity-60 ${isTeamA ? '' : 'flex-row-reverse'}`}
                  >
                    {avatar}
                    {name}
                  </button>
                ) : (
                  <div className={`flex min-w-0 items-center gap-1.5 ${isTeamA ? '' : 'flex-row-reverse'}`}>
                    {avatar}
                    {name}
                  </div>
                )}
                {isEditing && canEditResults && (
                  <button
                    type="button"
                    aria-label={t('gameResults.removeFromMatch')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePlayer(team, playerId);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95 dark:text-gray-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <X size={15} strokeWidth={2.25} />
                  </button>
                )}
              </div>
            );
          })}
          {Array.from({ length: openSeats }).map((_, index) => {
            const isTarget = isEditing && canEditResults && lineupTargetTeam === team && index === 0;
            const tappable = lineupEditable || (isEditing && canEditResults);
            return (
              <div key={`placeholder-${index}`} className="w-full">
                <button
                  type="button"
                  disabled={!tappable}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tappable) onPlayerPlaceholderClick(team);
                  }}
                  className={`flex min-h-[32px] w-full min-w-0 items-center gap-1.5 rounded-lg px-1 transition-opacity ${isTeamA ? '' : 'flex-row-reverse text-end'} ${
                    tappable ? 'active:opacity-60' : 'cursor-default'
                  } ${
                    isTarget
                      ? 'border-2 border-primary-400 bg-primary-50/80 dark:border-primary-500 dark:bg-primary-900/30'
                      : lineupEditable && !isEditing && !draggedPlayer
                        ? 'border border-dashed border-gray-300 dark:border-gray-600'
                        : ''
                  }`}
                >
                  <div className="shrink-0">
                    <PlayerAvatar
                      player={null}
                      showName={false}
                      fullHideName={true}
                      extrasmall={true}
                    />
                  </div>
                  <span
                    className={`truncate text-xs ${isTeamA ? 'text-start' : 'text-end'} ${
                      isTarget ? 'font-semibold text-primary-700 dark:text-primary-300' : 'italic text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {isTarget
                      ? t('gameResults.nextPick')
                      : lineupEditable
                        ? t('gameResults.addPlayer')
                        : t('gameResults.selectPlayer', 'Player')}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      className={`relative rounded-2xl border bg-white px-2 pt-2 pb-2.5 shadow-sm transition-[border-color,box-shadow] duration-200 dark:bg-gray-800 ${
        isEditing && canEditResults
          ? 'border-primary-300 shadow-lg shadow-primary-500/10 ring-1 ring-primary-300/60 dark:border-primary-700 dark:ring-primary-700/50'
          : 'border-gray-200/90 hover:shadow-md dark:border-gray-700/80'
      }`}
      data-match-container
      data-results-match-id={match.id}
    >
      <div className="mb-1 flex min-h-[1.5rem] items-center gap-1.5 px-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide tabular-nums leading-none text-gray-500 dark:bg-gray-700/70 dark:text-gray-300">
            {t('gameResults.match', { number: matchIndex + 1 })}
          </span>
          <MatchResultsHeaderBadges
            showLivePulse={matchInProgressHeader}
            showCompletedCheck={matchFinished}
            gameResultsFinal={resultsFinal}
          />
        </div>
        {headerTrailing}
      </div>

      {showCourtLabel && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onCourtClick && canEditResults) {
              onCourtClick();
            }
          }}
          className={`absolute top-1.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all ${
            canEditResults
              ? 'cursor-pointer border-blue-200 bg-blue-50 text-blue-700 hover:scale-105 hover:bg-blue-100 active:scale-95 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50'
              : 'cursor-default border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          <MapPin size={10} />
          <span>{selectedCourt?.name || 'Court'}</span>
        </button>
      )}

      {game && roundId && gameId && onMatchTimerTransition ? (
        <MatchTimerPanel
          match={match}
          game={game}
          roundId={roundId}
          gameId={gameId}
          canControl={canEditResults && canEnterResults}
          onTransition={onMatchTimerTransition}
        />
      ) : null}

      <motion.div
        layout
        transition={{ layout: { type: 'spring', stiffness: 380, damping: 32 } }}
        className={`w-full transition-[padding,background-color] duration-200 ease-out ${
          isEditing && canEditResults
            ? 'rounded-xl bg-primary-50/60 py-4 dark:bg-primary-950/25'
            : ''
        } ${canEditResults ? 'cursor-pointer' : ''}`}
        onClick={canEditResults ? (e) => {
          e.stopPropagation();
          onMatchClick();
        } : undefined}
      >
        <motion.div layout className="flex items-center w-full gap-1 min-w-0" transition={{ layout: { type: 'spring', stiffness: 380, damping: 32 } }}>
          <motion.div layout className="flex-1 flex justify-start min-w-0" transition={{ layout: { type: 'spring', stiffness: 380, damping: 32 } }}>
            {renderTeam('teamA')}
          </motion.div>

          <AnimatePresence initial={false} mode="popLayout">
            {showCenterColumn ? (
              <motion.div
                key="center-block"
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="flex flex-col items-center gap-0.5 flex-shrink-0"
              >
            {showScores ? (
            <div className="flex items-center gap-2">
              {displaySets.map((set, setIndex) => {
                const isExtra = isSupplementalMatchSet(set);
                const shouldShowScore = set.teamA !== 0 || set.teamB !== 0 || !resultsFinal;
                if (!shouldShowScore) return null;

                const handleTileClick = (e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  if (canEditResults) onSetClick(setIndex);
                };

                return (
                  <div key={setIndex} className="flex flex-col items-center gap-0.5">
                    {isExtra ? (
                      <span className="text-[7px] font-bold uppercase text-violet-600 dark:text-violet-400">
                        {set.role === 'EXTRA_BALLS'
                          ? t('gameResults.extraUnitBallsAbbr')
                          : t('gameResults.extraUnitGamesAbbr')}
                      </span>
                    ) : null}
                    <div className="flex items-center gap-1">
                      <SetScoreTile
                        value={set.teamA}
                        state={getSetScoreTileState(set.teamA, set.teamB)}
                        editable={canEditResults}
                        isExtra={isExtra}
                        size="lg"
                        onClick={handleTileClick}
                      />
                      <span className="text-xl font-bold text-gray-300 dark:text-gray-600 sm:text-2xl">:</span>
                      <SetScoreTile
                        value={set.teamB}
                        state={getSetScoreTileState(set.teamB, set.teamA)}
                        editable={canEditResults}
                        isExtra={isExtra}
                        size="lg"
                        onClick={handleTileClick}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            ) : null}
            {showEnterScore ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetClick(nextEntrySetIndex(match, rules) ?? 0);
                }}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 active:scale-[0.98]"
              >
                <PenLine size={16} aria-hidden />
                {t('gameResults.enterScore')}
              </button>
            ) : null}
            {liveGameId ? (
              <motion.div layout className="mt-1 flex justify-center" onClick={(e) => e.stopPropagation()}>
                <LivePlayLink gameId={liveGameId} matchId={match.id} size="sm" />
              </motion.div>
            ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <motion.div layout className="flex-1 flex justify-end min-w-0" transition={{ layout: { type: 'spring', stiffness: 380, damping: 32 } }}>
            {renderTeam('teamB')}
          </motion.div>
        </motion.div>
      </motion.div>
      {overlays}
    </motion.div>
  );
};

