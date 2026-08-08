import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trash2, MapPin, Play } from 'lucide-react';
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
import { MatchHeaderEditToggleButton } from '@/components/gameResults/MatchHeaderEditToggleButton';
import { SetScoreTile } from '@/components/gameResults/SetScoreTile';
import { getSetScoreTileState } from '@/components/gameResults/setScoreTileState';
import { MatchResultsHeaderBadges } from '@/components/gameResults/MatchResultsHeaderBadges';
import { MatchTimerPanel } from '@/components/gameResults/matchTimer/MatchTimerPanel';
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

  if (
    !canEditResults &&
    !matchSetsHaveAnyNonZeroScore(match.sets) &&
    !matchFinished &&
    !matchInProgressHeader
  ) {
    return null;
  }

  const maxPlayersPerTeam = maxPlayersPerTeamForGame(game, players.length);
  const teamSlotsFull = (team: 'teamA' | 'teamB') =>
    Array.from({ length: maxPlayersPerTeam }, (_, i) => Boolean(match[team][i])).every(Boolean);
  const teamsFull = teamSlotsFull('teamA') && teamSlotsFull('teamB');

  const canShowLivePlay = Boolean(gameId) && !matchFinished && canEditResults && !isEditing;
  const livePlayEnabled = canShowLivePlay && teamsFull;

  const matchActionRoundClass =
    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md active:scale-95';

  const livePlayLink = canShowLivePlay && gameId ? (
    livePlayEnabled ? (
      <Link
        to={`/games/${gameId}/live?matchId=${encodeURIComponent(match.id)}`}
        aria-label={t('gameDetails.liveScorePlay')}
        title={t('gameDetails.liveScorePlay')}
        className={matchActionRoundClass}
        onClick={(e) => e.stopPropagation()}
      >
        <Play className="h-3.5 w-3.5" strokeWidth={2} />
      </Link>
    ) : (
      <span
        aria-disabled
        aria-label={t('gameDetails.liveScorePlay')}
        title={t('gameDetails.liveScorePlay')}
        className={`${matchActionRoundClass} cursor-not-allowed opacity-40 grayscale pointer-events-none`}
      >
        <Play className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    )
  ) : null;

  const showScores = canEnterResults && !isEditing && teamsFull;
  const showAddSupplementalSet =
    !isEditing &&
    canEditResults &&
    Boolean(onAddSupplementalSet) &&
    canEnterResults &&
    teamsFull &&
    matchFinished;
  const showCenterColumn = showScores || Boolean(livePlayLink) || showAddSupplementalSet;

  const headerEditButton = showHeaderEditButton ? (
    <MatchHeaderEditToggleButton
      isEditing={isEditing}
      editLabel={t('gameResults.edit')}
      cancelLabel={t('common:cancel')}
      onEditClick={onMatchClick}
      onCancelClick={onCancelMatchEdit}
    />
  ) : null;

  const renderTeam = (team: 'teamA' | 'teamB') => {
    const teamPlayers = match[team].slice(0, maxPlayersPerTeam);
    const isWinner = resolvedWinnerTeam === team;
    const isTeamA = team === 'teamA';

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

            return (
              <div
                key={playerId}
                className={`flex items-center gap-1.5 min-w-0 max-w-full ${isTeamA ? '' : 'flex-row-reverse text-right'}`}
              >
                <div className="shrink-0">
                  <PlayerAvatar
                    player={player}
                    draggable={false}
                    showName={false}
                    fullHideName={true}
                    extrasmall={true}
                  />
                </div>
                <span className={`truncate text-xs font-semibold text-gray-800 dark:text-gray-100 leading-tight ${isTeamA ? 'text-left' : 'text-right'}`}>
                  {playerName}
                </span>
                {isEditing && canEditResults && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePlayer(team, playerId);
                    }}
                    className={`${isTeamA ? 'ml-0.5' : 'mr-0.5'} shrink-0 h-5 w-5 rounded-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors border border-white dark:border-gray-900`}
                  >
                    <Trash2 size={10} className="text-white" />
                  </button>
                )}
              </div>
            );
          })}
          {Array.from({ length: Math.max(0, maxPlayersPerTeam - teamPlayers.length) }).map((_, index) => (
            <div key={`placeholder-${index}`} className="w-full">
              <div
                onClick={() => {
                  if (isEditing && canEditResults) {
                    onPlayerPlaceholderClick(team);
                  }
                }}
                className={`flex items-center gap-1.5 min-w-0 max-w-full ${isTeamA ? '' : 'flex-row-reverse text-right'} ${
                  isEditing && canEditResults ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
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
                <span className={`truncate text-xs text-gray-400 dark:text-gray-500 italic ${isTeamA ? 'text-left' : 'text-right'}`}>
                  {t('gameResults.selectPlayer', 'Player')}
                </span>
              </div>
            </div>
          ))}
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
    >
      <div
        className={`mb-1 flex min-h-[1rem] flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 ${showHeaderEditButton || showDeleteButton ? 'pr-14' : ''}`}
      >
        <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide tabular-nums leading-none text-gray-500 dark:bg-gray-700/70 dark:text-gray-300">
          {t('gameResults.match', { number: matchIndex + 1 })}
        </span>
        <MatchResultsHeaderBadges
          showLivePulse={matchInProgressHeader}
          showCompletedCheck={matchFinished}
          gameResultsFinal={resultsFinal}
        />
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

      {(headerEditButton || showDeleteButton) && (
        <div
          className="absolute right-2 top-1.5 z-10 flex flex-row items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {headerEditButton}
          {showDeleteButton ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveMatch();
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-500 shadow-sm transition-all hover:scale-105 hover:border-red-300 hover:bg-red-100 hover:text-red-600 active:scale-95 dark:border-red-900/60 dark:bg-red-950/40 dark:hover:bg-red-950/70"
            >
              <Trash2 size={12} strokeWidth={2} />
            </button>
          ) : null}
        </div>
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
            <AnimatePresence initial={false} mode="popLayout">
              {showAddSupplementalSet ? (
                <motion.div
                  key="add-supp"
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className="flex justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddSupplementalSet?.();
                    }}
                    className="rounded-lg border border-dashed border-violet-400/70 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40"
                  >
                    {t('gameResults.addExtraSet')}
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
            {livePlayLink ? (
              <motion.div layout className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                {livePlayLink}
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
    </motion.div>
  );
};

