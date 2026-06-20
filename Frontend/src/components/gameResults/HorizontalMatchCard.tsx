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
import { MatchHeaderEditToggleButton } from '@/components/gameResults/MatchHeaderEditToggleButton';
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
    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-sm transition hover:from-primary-600 hover:to-primary-700 active:scale-[0.98]';

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

    return (
      <div
        data-drop-zone
        data-match-id={match.id}
        data-team={team}
        className={`relative flex min-h-[40px] w-full items-center justify-center px-0 py-2 ${
          (isEditing || draggedPlayer) && canEditResults ? 'rounded-lg border-2 border-dashed border-gray-300 transition-colors dark:border-gray-600' : ''
        } ${
          canEditResults && draggedPlayer ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : ''
        } ${
          isWinner
            ? 'rounded-lg border border-emerald-200/90 bg-emerald-50/90 dark:border-emerald-800/50 dark:bg-emerald-950/35'
            : ''
        }`}
        onDragOver={canEditResults ? onDragOver : undefined}
        onDrop={canEditResults ? (e) => onDrop(e, team) : undefined}
      >
        <div className="flex gap-5 justify-center">
          {teamPlayers.map(playerId => {
            const player = players.find(p => p.id === playerId);
            return player ? (
              <div key={playerId} className="flex flex-col items-center">
                <PlayerAvatar
                  player={player}
                  draggable={false}
                  showName={true}
                  extrasmall={true}
                />
                {isEditing && canEditResults && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePlayer(team, playerId);
                    }}
                    className="mt-1 w-7 h-7 rounded-full bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors border-2 border-white dark:border-gray-900"
                  >
                    <Trash2 size={14} className="text-white" />
                  </button>
                )}
              </div>
            ) : null;
          })}
          {Array.from({ length: Math.max(0, maxPlayersPerTeam - teamPlayers.length) }).map((_, index) => (
            <div key={`placeholder-${index}`}>
              <div
                onClick={() => {
                  if (isEditing && canEditResults) {
                    onPlayerPlaceholderClick(team);
                  }
                }}
                className={`${
                  isEditing && canEditResults ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                }`}
              >
                <PlayerAvatar
                  player={null}
                  showName={false}
                  extrasmall={true}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="relative px-0 pt-2 pb-2" data-match-container>
      {matchIndex > 0 && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gray-200 dark:bg-gray-700"></div>
      )}

      <div
        className={`mb-0.5 flex min-h-[1rem] flex-wrap items-center gap-x-1 gap-y-0.5 px-1 ${showHeaderEditButton || showDeleteButton ? 'pr-14' : ''}`}
      >
        <span className="text-[10px] font-medium tabular-nums leading-none text-gray-500 dark:text-gray-400">
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
          className={`absolute -top-1 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
            canEditResults
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-900/50 cursor-pointer'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 cursor-default'
          }`}
        >
          <MapPin size={10} />
          <span>{selectedCourt?.name || 'Court'}</span>
        </button>
      )}

      {(headerEditButton || showDeleteButton) && (
        <div
          className="absolute right-0 top-0 z-10 flex flex-row items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {headerEditButton}
          {showDeleteButton ? (
            <div className="pr-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveMatch();
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-red-500 bg-white text-red-500 shadow transition-colors hover:border-red-600 hover:text-red-600 dark:bg-gray-800"
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
            </div>
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
        className={`w-full transition-[padding,box-shadow,background-color] duration-200 ease-out ${
          isEditing && canEditResults
            ? 'rounded-lg bg-green-50 py-4 ring-2 ring-green-400 dark:bg-green-900/20 dark:ring-green-500'
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
                const teamAScore = set.teamA;
                const teamBScore = set.teamB;
                const isExtra = isSupplementalMatchSet(set);
                const isEditable = canEditResults;
                const teamAIsWinning = teamAScore > teamBScore && teamAScore > 0 && teamBScore >= 0;
                const teamAIsLosing = teamAScore < teamBScore && teamAScore >= 0 && teamBScore > 0;
                const teamAIsTie = teamAScore === teamBScore && teamAScore > 0 && teamBScore > 0;
                const teamBIsWinning = teamBScore > teamAScore && teamBScore > 0 && teamAScore >= 0;
                const teamBIsLosing = teamBScore < teamAScore && teamBScore >= 0 && teamAScore > 0;
                const teamBIsTie = teamAScore === teamBScore && teamAScore > 0 && teamBScore > 0;
                const shouldShowScore = set.teamA !== 0 || set.teamB !== 0 || !resultsFinal;
                const extraCls = isExtra
                  ? ' !border-violet-400 border-dashed dark:!border-violet-500 bg-violet-50/80 dark:bg-violet-950/30'
                  : '';

                if (!shouldShowScore) return null;

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
                    <button
                      type="button"
                      onClick={
                        isEditable
                          ? (e) => {
                              e.stopPropagation();
                              onSetClick(setIndex);
                            }
                          : (e) => e.stopPropagation()
                      }
                      className="relative group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-lg" />
                      <div className={`relative w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 flex items-center justify-center rounded-xl border-2 transition-all duration-200 shadow-lg group-hover:shadow-xl group-hover:scale-105 active:scale-95 ${
                        isExtra
                          ? extraCls + (isEditable ? ' cursor-pointer' : '')
                          : teamAIsWinning
                          ? 'bg-gradient-to-br from-green-100/90 to-green-200/80 dark:from-green-900/40 dark:to-green-800/30 border-green-300/70 dark:border-green-700/50 shadow-green-500/30'
                          : teamAIsLosing
                            ? 'bg-gradient-to-br from-red-50/60 to-red-100/40 dark:from-red-900/30 dark:to-red-800/20 border-red-200/50 dark:border-red-700/40 shadow-red-500/20'
                            : teamAIsTie
                              ? 'bg-gradient-to-br from-yellow-100/90 to-yellow-200/80 dark:from-yellow-900/40 dark:to-yellow-800/30 border-yellow-300/70 dark:border-yellow-700/50 shadow-yellow-500/30'
                              : isEditable
                                ? 'bg-gradient-to-br from-blue-50/80 to-blue-100/60 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-300/70 dark:border-blue-600/50 cursor-pointer'
                                : 'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-gray-200 dark:border-gray-700 cursor-default'
                      }`}>
                        <span className={`font-bold bg-gradient-to-br bg-clip-text text-transparent ${
                          teamAIsWinning
                            ? 'from-green-700 to-green-600 dark:from-green-300 dark:to-green-400'
                            : teamAIsLosing
                              ? 'from-red-700 to-red-600 dark:from-red-300 dark:to-red-400'
                              : teamAIsTie
                                ? 'from-yellow-700 to-yellow-600 dark:from-yellow-300 dark:to-yellow-400'
                                : 'from-gray-900 to-gray-700 dark:from-white dark:to-gray-300'
                        } text-xl sm:text-2xl md:text-3xl`}>
                          {teamAScore}
                        </span>
                      </div>
                    </button>
                    <span className="text-gray-400 dark:text-gray-600 text-xl sm:text-2xl md:text-3xl font-bold">:</span>
                    <button
                      type="button"
                      onClick={
                        isEditable
                          ? (e) => {
                              e.stopPropagation();
                              onSetClick(setIndex);
                            }
                          : (e) => e.stopPropagation()
                      }
                      className="relative group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-lg" />
                      <div className={`relative w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 flex items-center justify-center rounded-xl border-2 transition-all duration-200 shadow-lg group-hover:shadow-xl group-hover:scale-105 active:scale-95 ${
                        isExtra
                          ? extraCls + (isEditable ? ' cursor-pointer' : '')
                          : teamBIsWinning
                          ? 'bg-gradient-to-br from-green-100/90 to-green-200/80 dark:from-green-900/40 dark:to-green-800/30 border-green-300/70 dark:border-green-700/50 shadow-green-500/30'
                          : teamBIsLosing
                            ? 'bg-gradient-to-br from-red-50/60 to-red-100/40 dark:from-red-900/30 dark:to-red-800/20 border-red-200/50 dark:border-red-700/40 shadow-red-500/20'
                            : teamBIsTie
                              ? 'bg-gradient-to-br from-yellow-100/90 to-yellow-200/80 dark:from-yellow-900/40 dark:to-yellow-800/30 border-yellow-300/70 dark:border-yellow-700/50 shadow-yellow-500/30'
                              : isEditable
                                ? 'bg-gradient-to-br from-blue-50/80 to-blue-100/60 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-300/70 dark:border-blue-600/50 cursor-pointer'
                                : 'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-gray-200 dark:border-gray-700 cursor-default'
                      }`}>
                        <span className={`font-bold bg-gradient-to-br bg-clip-text text-transparent ${
                          teamBIsWinning
                            ? 'from-green-700 to-green-600 dark:from-green-300 dark:to-green-400'
                            : teamBIsLosing
                              ? 'from-red-700 to-red-600 dark:from-red-300 dark:to-red-400'
                              : teamBIsTie
                                ? 'from-yellow-700 to-yellow-600 dark:from-yellow-300 dark:to-yellow-400'
                                : 'from-gray-900 to-gray-700 dark:from-white dark:to-gray-300'
                        } text-xl sm:text-2xl md:text-3xl`}>
                          {teamBScore}
                        </span>
                      </div>
                    </button>
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
    </div>
  );
};

