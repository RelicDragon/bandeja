import type { MouseEvent, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, MapPin, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  isSuperTieBreakDeciderRow,
  layoutSetIndicesForMatchGrid,
  matchSetsHaveAnyNonZeroScore,
} from '@/utils/scoring';
import { isSupplementalMatchSet } from '@/utils/matchSetRole';
import { MatchHeaderEditToggleButton } from '@/components/gameResults/MatchHeaderEditToggleButton';
import { MatchResultsHeaderBadges } from '@/components/gameResults/MatchResultsHeaderBadges';
import { MatchTimerPanel } from '@/components/gameResults/matchTimer/MatchTimerPanel';
import { useScrollbarVisibleWhileScrolling } from '@/hooks/useScrollbarVisibleWhileScrolling';
import type { MatchTimerAction } from '@/utils/matchTimer';

interface MatchCardProps {
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
  game?: Pick<Game, 'scoringPreset' | 'matchTimedCapMinutes' | 'fixedNumberOfSets' | 'maxTotalPointsPerSet' | 'maxPointsPerTeam' | 'winnerOfMatch' | 'ballsInGames' | 'hasGoldenPoint' | 'pointsPerTie' | 'resultsStatus'> | null;
  roundId?: string;
  gameId?: string;
  onMatchTimerTransition?: (roundId: string, matchId: string, action: MatchTimerAction) => void | Promise<void>;
  onAddSupplementalSet?: () => void;
}

export const MatchCard = ({
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
}: MatchCardProps) => {
  const { t } = useTranslation();
  const { scrollRef, onScroll, scrollbarClassName } = useScrollbarVisibleWhileScrolling();
  const rules = getRules(game ?? { fixedNumberOfSets, maxTotalPointsPerSet: 0, maxPointsPerTeam: 0, winnerOfMatch: 'BY_SCORES', ballsInGames: false, hasGoldenPoint: false, pointsPerTie: 0, scoringPreset: null } as any);
  const displaySets = expandSetsForDisplay(match.sets, rules, { canEditResults });
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

  const maxPlayersPerTeam = players.length === 2 ? 1 : 2;
  const teamSlotsFull = (team: 'teamA' | 'teamB') =>
    Array.from({ length: maxPlayersPerTeam }, (_, i) => Boolean(match[team][i])).every(Boolean);
  const teamsFull = teamSlotsFull('teamA') && teamSlotsFull('teamB');

  const canShowLivePlay = Boolean(gameId) && !matchFinished && canEditResults && !isEditing;
  const livePlayEnabled = canShowLivePlay && teamsFull;

  const matchActionRoundClass =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md transition hover:from-primary-600 hover:to-primary-700 active:scale-[0.98]';

  const livePlayLink = canShowLivePlay && gameId ? (
    livePlayEnabled ? (
      <Link
        to={`/games/${gameId}/live?matchId=${encodeURIComponent(match.id)}`}
        aria-label={t('gameDetails.liveScorePlay')}
        title={t('gameDetails.liveScorePlay')}
        className={matchActionRoundClass}
        onClick={(e) => e.stopPropagation()}
      >
        <Play className="h-5 w-5" strokeWidth={2} />
      </Link>
    ) : (
      <span
        aria-disabled
        aria-label={t('gameDetails.liveScorePlay')}
        title={t('gameDetails.liveScorePlay')}
        className={`${matchActionRoundClass} cursor-not-allowed opacity-40 grayscale pointer-events-none`}
      >
        <Play className="h-5 w-5" strokeWidth={2} />
      </span>
    )
  ) : null;

  const headerEditButton = showHeaderEditButton ? (
    <MatchHeaderEditToggleButton
      isEditing={isEditing}
      editLabel={t('gameResults.edit')}
      cancelLabel={t('common:cancel')}
      onEditClick={onMatchClick}
      onCancelClick={onCancelMatchEdit}
    />
  ) : null;

  const showMatchActionsColumn = Boolean(livePlayLink);
  const layoutSetIndices = isEditing || !teamsFull
    ? []
    : layoutSetIndicesForMatchGrid(displaySets, canEnterResults, game?.resultsStatus ?? null);
  const resultsFinal = game?.resultsStatus === 'FINAL';
  const setCount = layoutSetIndices.length;
  const actionsColStart = setCount + 2;

  const showPlayerRemoveButton = isEditing && canEditResults;

  const teamDropClass = (team: 'teamA' | 'teamB') =>
    `min-h-[36px] ${(isEditing || draggedPlayer) && canEditResults ? 'border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md transition-colors' : ''} ${
      canEditResults && draggedPlayer ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : ''
    } ${
      resolvedWinnerTeam === team
        ? 'rounded-md border border-emerald-200/90 bg-emerald-50/90 dark:border-emerald-800/50 dark:bg-emerald-950/35'
        : ''
    }`;

  const renderPlayerSlot = (team: 'teamA' | 'teamB', slotIndex: number) => {
    const teamPlayers = match[team];
    const playerId = teamPlayers[slotIndex];
    const player = playerId ? players.find(p => p.id === playerId) : null;
    const showPlaceholder = !player && slotIndex < maxPlayersPerTeam;

    return (
      <div
        key={`${team}-${slotIndex}`}
        data-drop-zone
        data-match-id={match.id}
        data-team={team}
        className={`relative flex min-h-[40px] w-full min-w-0 flex-row items-center gap-2 px-2 py-0.5 ${teamDropClass(team)}`}
        onDragOver={canEditResults ? onDragOver : undefined}
        onDrop={canEditResults ? (e) => onDrop(e, team) : undefined}
      >
        {player ? (
          <>
            <PlayerAvatar
              player={player}
              draggable={false}
              showName={false}
              inlineFace
              inlineFaceSize="md"
              removable={false}
            />
            <span
              className={`min-w-0 flex-1 truncate text-left text-xs font-medium text-gray-800 dark:text-gray-200 ${showPlayerRemoveButton ? 'pr-10' : ''}`}
            >
              {[player.firstName, player.lastName].filter(Boolean).join(' ') || '—'}
            </span>
            {showPlayerRemoveButton ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemovePlayer(team, playerId);
                }}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 shrink-0 rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </>
        ) : showPlaceholder ? (
          <button
            type="button"
            className={`flex items-center gap-2 ${isEditing && canEditResults ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            onClick={(e) => {
              e.stopPropagation();
              if (isEditing && canEditResults) {
                onPlayerPlaceholderClick(team);
              }
            }}
          >
            <PlayerAvatar player={null} showName={false} inlineFace inlineFaceSize="md" removable={false} />
            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
          </button>
        ) : null}
      </div>
    );
  };

  const renderScoreButton = (team: 'teamA' | 'teamB', setIndex: number) => {
    const set = displaySets[setIndex];
    const teamAScore = set.teamA;
    const teamBScore = set.teamB;
    const isExtra = isSupplementalMatchSet(set);
    const isEditable = canEditResults;
    const isWinning =
      team === 'teamA'
        ? teamAScore > teamBScore && teamAScore > 0 && teamBScore >= 0
        : teamBScore > teamAScore && teamBScore > 0 && teamAScore >= 0;
    const isLosing =
      team === 'teamA'
        ? teamAScore < teamBScore && teamAScore >= 0 && teamBScore > 0
        : teamBScore < teamAScore && teamBScore >= 0 && teamAScore > 0;
    const isTie = teamAScore === teamBScore && teamAScore > 0 && teamBScore > 0;

    const shouldShowScore = set.teamA !== 0 || set.teamB !== 0 || !resultsFinal;
    const extraCls = isExtra
      ? ' !border-violet-400 border-dashed dark:!border-violet-500 bg-violet-50/80 dark:bg-violet-950/30'
      : '';

    return (
      <div key={`${team}-set-${setIndex}`} className="flex h-full min-h-[40px] items-center justify-center p-0.5">
        {shouldShowScore ? (
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
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 opacity-0 blur-lg transition-opacity duration-200 group-hover:opacity-20" />
            <div
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 shadow-lg transition-all duration-200 sm:h-11 sm:w-11 group-hover:scale-105 group-hover:shadow-xl active:scale-95 ${
                isExtra
                  ? extraCls + (isEditable ? ' cursor-pointer' : '')
                  : isWinning
                    ? 'border-green-300/70 bg-gradient-to-br from-green-100/90 to-green-200/80 shadow-green-500/30 dark:border-green-700/50 dark:from-green-900/40 dark:to-green-800/30'
                    : isLosing
                      ? 'border-red-200/50 bg-gradient-to-br from-red-50/60 to-red-100/40 shadow-red-500/20 dark:border-red-700/40 dark:from-red-900/30 dark:to-red-800/20'
                      : isTie
                        ? 'border-yellow-300/70 bg-gradient-to-br from-yellow-100/90 to-yellow-200/80 shadow-yellow-500/30 dark:border-yellow-700/50 dark:from-yellow-900/40 dark:to-yellow-800/30'
                        : isEditable
                          ? 'cursor-pointer border-blue-300/70 bg-gradient-to-br from-blue-50/80 to-blue-100/60 dark:border-blue-600/50 dark:from-blue-900/30 dark:to-blue-800/20'
                          : 'cursor-default border-gray-200 bg-gradient-to-br from-white to-gray-50 dark:border-gray-700 dark:from-gray-800 dark:to-gray-900'
              }`}
            >
              <span
                className={`min-w-0 tabular-nums bg-gradient-to-br bg-clip-text text-xl font-bold text-transparent sm:text-2xl ${
                  isWinning
                    ? 'from-green-700 to-green-600 dark:from-green-300 dark:to-green-400'
                    : isLosing
                      ? 'from-red-700 to-red-600 dark:from-red-300 dark:to-red-400'
                      : isTie
                        ? 'from-yellow-700 to-yellow-600 dark:from-yellow-300 dark:to-yellow-400'
                        : 'from-gray-900 to-gray-700 dark:from-white dark:to-gray-300'
                }`}
              >
                {team === 'teamA' ? teamAScore : teamBScore}
              </span>
            </div>
            {set.isTieBreak && (
              <span className="absolute right-0 -top-3 rounded bg-white px-1 text-[8px] font-bold text-primary-600 dark:bg-gray-800 dark:text-primary-400 sm:text-[9px]">
                {isSuperTieBreakDeciderRow(rules, setIndex, set.isTieBreak)
                  ? t('gameResults.superTieBreakAbbr')
                  : t('gameResults.tieBreakAbbr')}
              </span>
            )}
            {isExtra ? (
              <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[7px] font-bold uppercase tracking-tight text-violet-600 dark:text-violet-400">
                {set.role === 'EXTRA_BALLS'
                  ? t('gameResults.extraUnitBallsAbbr')
                  : t('gameResults.extraUnitGamesAbbr')}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
    );
  };

  const playersCol = 'minmax(10rem,1fr)';
  const gridTemplateColumns =
    setCount > 0
      ? `${playersCol} repeat(${setCount}, 2.75rem)${showMatchActionsColumn ? ' auto' : ''}`
      : `${playersCol}${showMatchActionsColumn ? ' auto' : ''}`;

  let row = 0;
  const courtRow = showCourtLabel ? ++row : 0;
  const teamAStart = ++row;
  const teamARows = maxPlayersPerTeam;
  const sepRow = row + teamARows;
  row = sepRow;
  const teamBStart = ++row;
  const teamBRows = maxPlayersPerTeam;
  const totalRows = row + teamBRows - 1;
  const actionsBodyRowSpan = sepRow - teamAStart + 1 + teamBRows;

  const gridNodes: ReactElement[] = [];

  if (showCourtLabel) {
    gridNodes.push(
      <div
        key="court"
        className="flex items-center gap-2 py-1.5"
        style={{ gridColumn: '1 / -1', gridRow: courtRow }}
      >
        <span className="h-px min-w-[1rem] flex-1 bg-gray-200 dark:bg-gray-600" />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onCourtClick && canEditResults) {
              onCourtClick();
            }
          }}
          className={`inline-flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-xs transition-colors ${
            canEditResults
              ? 'cursor-pointer border-blue-200 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50'
              : 'cursor-default border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          <MapPin size={10} />
          <span>{selectedCourt?.name || 'Court'}</span>
        </button>
        <span className="h-px min-w-[1rem] flex-1 bg-gray-200 dark:bg-gray-600" />
      </div>
    );
  }

  for (let s = 0; s < maxPlayersPerTeam; s++) {
    gridNodes.push(
      <div key={`a-slot-${s}`} className="min-w-0" style={{ gridColumn: 1, gridRow: teamAStart + s }}>
        {renderPlayerSlot('teamA', s)}
      </div>
    );
  }

  if (setCount > 0) {
    for (let c = 0; c < layoutSetIndices.length; c++) {
      const setIndex = layoutSetIndices[c];
      const col = c + 2;
      gridNodes.push(
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          key={`a-score-${setIndex}`}
          style={{ gridColumn: col, gridRow: `${teamAStart} / span ${teamARows}` }}
          className="flex items-stretch justify-center"
        >
          {renderScoreButton('teamA', setIndex)}
        </motion.div>
      );
    }
  }

  gridNodes.push(
    <div
      key="sep-line"
      className="flex min-h-0 items-center border-t border-gray-200 dark:border-gray-700"
      style={{ gridColumn: showMatchActionsColumn ? `1 / ${actionsColStart}` : '1 / -1', gridRow: sepRow }}
    />
  );

  if (showMatchActionsColumn) {
    gridNodes.push(
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        key="match-actions"
        className="flex flex-row items-center justify-center gap-1.5 py-1"
        style={{ gridColumn: actionsColStart, gridRow: `${teamAStart} / span ${actionsBodyRowSpan}` }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {livePlayLink}
      </motion.div>
    );
  }

  for (let s = 0; s < maxPlayersPerTeam; s++) {
    gridNodes.push(
      <div key={`b-slot-${s}`} className="min-w-0" style={{ gridColumn: 1, gridRow: teamBStart + s }}>
        {renderPlayerSlot('teamB', s)}
      </div>
    );
  }

  if (setCount > 0) {
    for (let c = 0; c < layoutSetIndices.length; c++) {
      const setIndex = layoutSetIndices[c];
      const col = c + 2;
      gridNodes.push(
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          key={`b-score-${setIndex}`}
          style={{ gridColumn: col, gridRow: `${teamBStart} / span ${teamBRows}` }}
          className="flex items-stretch justify-center"
        >
          {renderScoreButton('teamB', setIndex)}
        </motion.div>
      );
    }
  }

  return (
    <div className="relative px-2 pb-2 pt-2" data-match-container>
      {matchIndex > 0 && (
        <div className="absolute left-0 right-0 top-0 h-px bg-gray-200 dark:bg-gray-700" />
      )}

      <div
        className={`mb-0.5 flex min-h-[1rem] flex-wrap items-center gap-x-1 gap-y-0.5 ${showHeaderEditButton || showDeleteButton ? 'pr-14' : ''}`}
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

      {(headerEditButton || showDeleteButton) && (
        <div className="absolute right-0 top-0 z-10 flex flex-row items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {headerEditButton}
          {showDeleteButton ? (
            <div className="pr-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveMatch();
                }}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-red-500 bg-white text-red-500 shadow transition-colors hover:border-red-600 hover:text-red-600 dark:bg-gray-800"
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
            ? 'rounded-lg bg-green-50 py-3 ring-2 ring-green-400 dark:bg-green-900/20 dark:ring-green-500'
            : ''
        } ${canEditResults ? 'cursor-pointer' : ''}`}
        onClick={
          canEditResults
            ? (e) => {
                e.stopPropagation();
                onMatchClick();
              }
            : undefined
        }
      >
        <motion.div
          ref={scrollRef}
          layout
          className={`w-full overflow-x-auto ${scrollbarClassName}`}
          onScroll={onScroll}
          transition={{ layout: { type: 'spring', stiffness: 380, damping: 32 } }}
        >
          <motion.div
            layout
            className="grid w-full min-w-0"
            style={{
              gridTemplateColumns,
              gridTemplateRows: `repeat(${totalRows}, auto)`,
            }}
            transition={{ layout: { type: 'spring', stiffness: 380, damping: 32 } }}
          >
            {gridNodes}
          </motion.div>
          <AnimatePresence initial={false} mode="popLayout">
            {!isEditing &&
            canEditResults &&
            onAddSupplementalSet &&
            canEnterResults &&
            teamsFull &&
            matchFinished ? (
              <motion.div
                key="add-supp"
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                className="mt-2 flex w-full justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddSupplementalSet();
                  }}
                  className="rounded-lg border border-dashed border-violet-400/70 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40"
                >
                  {t('gameResults.addExtraSet')}
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  );
};
