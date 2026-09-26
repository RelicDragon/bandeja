import type { MouseEvent, ReactElement } from 'react';
import { useMemo, useRef } from 'react';
import { MapPin, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
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
import { maxPlayersPerTeamForGame } from '@/utils/matchFormat';
import { nextEntrySetIndex } from '@/utils/resultsBoardNavigation';
import {
  EnterScoreRow,
  LivePlayLink,
  MatchEditDoneButton,
} from '@/components/gameResults/MatchCardControls';
import { useMatchCardActions } from '@/components/gameResults/useMatchCardActions';
import { SetScoreTile } from '@/components/gameResults/SetScoreTile';
import { getSetScoreTileState } from '@/components/gameResults/setScoreTileState';
import { MatchResultsHeaderBadges } from '@/components/gameResults/MatchResultsHeaderBadges';
import { MatchTimerPanel } from '@/components/gameResults/matchTimer/MatchTimerPanel';
import { useScrollbarVisibleWhileScrolling } from '@/hooks/useScrollbarVisibleWhileScrolling';
import { useElementWidth } from '@/hooks/useElementWidth';
import {
  matchCardDensityLayout,
  resolveMatchCardDensity,
} from '@/utils/matchCardDensity';
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
  game?: Pick<Game, 'scoringPreset' | 'matchTimedCapMinutes' | 'matchTimerEnabled' | 'fixedNumberOfSets' | 'maxTotalPointsPerSet' | 'maxPointsPerTeam' | 'winnerOfMatch' | 'ballsInGames' | 'deucesBeforeGoldenPoint' | 'pointsPerTie' | 'resultsStatus' | 'playersPerMatch' | 'sport'> | null;
  roundId?: string;
  gameId?: string;
  onMatchTimerTransition?: (roundId: string, matchId: string, action: MatchTimerAction) => void | Promise<void>;
  onAddSupplementalSet?: () => void;
  /** Drop outer card chrome when nested (e.g. league fixture card). */
  embedded?: boolean;
  /** Keep teams visible even when there are no scores yet. */
  forceShow?: boolean;
  /** Hide the "Match N" index chip. */
  hideMatchIndex?: boolean;
  /** "Edit lineup" in the ⋯ menu (shown when `showHeaderEditButton`). */
  onEditLineup?: () => void;
  /** Placed players become buttons (move / swap / remove sheet); empty seats become "Add player". */
  onPlayerTap?: (team: 'teamA' | 'teamB', playerId: string) => void;
  /** While editing the lineup, the side the next tapped player goes to. */
  lineupTargetTeam?: 'teamA' | 'teamB' | null;
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
  embedded = false,
  forceShow = false,
  hideMatchIndex = false,
  onEditLineup,
  onPlayerTap,
  lineupTargetTeam = null,
}: MatchCardProps) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const cardWidth = useElementWidth(rootRef);
  const { scrollRef, onScroll, scrollbarClassName } = useScrollbarVisibleWhileScrolling();
  const rules = getRules(game ?? { fixedNumberOfSets, maxTotalPointsPerSet: 0, maxPointsPerTeam: 0, winnerOfMatch: 'BY_SCORES', ballsInGames: false, deucesBeforeGoldenPoint: null, pointsPerTie: 0, scoringPreset: null } as any);
  const displaySets = expandSetsForDisplay(match.sets, rules, { canEditResults });
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
  const showMatchActionsColumn = Boolean(liveGameId) && !showEnterScore;
  const lineupEditable = canEditResults && Boolean(onPlayerTap);
  const layoutSetIndices =
    isEditing || !teamsFull || showEnterScore
      ? []
      : layoutSetIndicesForMatchGrid(displaySets, canEnterResults, game?.resultsStatus ?? null);
  const setCount = layoutSetIndices.length;
  const density = resolveMatchCardDensity(cardWidth, setCount, showMatchActionsColumn);
  const densityLayout = useMemo(
    () => matchCardDensityLayout(density, { preferSmallFaces: embedded }),
    [density, embedded],
  );

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
    !forceShow &&
    !canEditResults &&
    !matchSetsHaveAnyNonZeroScore(match.sets) &&
    !matchFinished &&
    !matchInProgressHeader
  ) {
    return null;
  }

  const resultsFinal = game?.resultsStatus === 'FINAL';
  const actionsColStart = setCount + 2;
  const headerTrailing =
    isEditing && canEditResults ? (
      <MatchEditDoneButton label={t('common.done')} onClick={onCancelMatchEdit} />
    ) : (
      menuButton
    );

  const showPlayerRemoveButton = isEditing && canEditResults;
  const {
    faceSize,
    playerRowClass,
    playerNameClass,
    placeholderGapClass,
    placeholderTextClass,
    scoreCellClass,
    teamMinHeightClass,
    tileSize,
    playersCol,
    setCol,
  } = densityLayout;

  const teamDropClass = (team: 'teamA' | 'teamB', isTarget = false) =>
    `${teamMinHeightClass} ${(isEditing || draggedPlayer) && canEditResults && !isTarget ? 'border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg transition-colors' : ''} ${
      canEditResults && draggedPlayer ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : ''
    } ${
      resolvedWinnerTeam === team
        ? 'rounded-lg bg-gradient-to-r from-emerald-100/90 via-emerald-50/60 to-transparent ring-1 ring-inset ring-emerald-300/60 dark:from-emerald-900/40 dark:via-emerald-950/25 dark:to-transparent dark:ring-emerald-700/50'
        : ''
    }`;

  const playerName = (player: BasicUser) =>
    [player.firstName, player.lastName].filter(Boolean).join(' ') || '—';

  const renderRemoveButton = (team: 'teamA' | 'teamB', playerId: string) => (
    <button
      type="button"
      aria-label={t('gameResults.removeFromMatch')}
      onClick={(e) => {
        e.stopPropagation();
        onRemovePlayer(team, playerId);
      }}
      className="absolute right-0.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95 dark:text-gray-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
    >
      <X size={16} strokeWidth={2.25} />
    </button>
  );

  const renderPlayerSlot = (team: 'teamA' | 'teamB', slotIndex: number) => {
    const teamPlayers = match[team];
    const playerId = teamPlayers[slotIndex];
    const player = playerId ? players.find(p => p.id === playerId) : null;
    const showPlaceholder = !player && slotIndex < maxPlayersPerTeam;
    const isTarget =
      isEditing && canEditResults && lineupTargetTeam === team && slotIndex === teamPlayers.length;
    const emptySlotClass = showPlaceholder && lineupEditable
      ? isTarget
        ? 'rounded-lg border-2 border-primary-400 bg-primary-50/80 dark:border-primary-500 dark:bg-primary-900/30'
        : !isEditing && !draggedPlayer
          ? 'rounded-lg border border-dashed border-gray-300 dark:border-gray-600'
          : ''
      : '';

    return (
      <div
        key={`${team}-${slotIndex}`}
        data-drop-zone
        data-match-id={match.id}
        data-team={team}
        className={`${playerRowClass} ${teamDropClass(team, isTarget)} ${emptySlotClass}`}
        onDragOver={canEditResults ? onDragOver : undefined}
        onDrop={canEditResults ? (e) => onDrop(e, team) : undefined}
      >
        {player && lineupEditable ? (
          <>
            <button
              type="button"
              aria-label={playerName(player)}
              className={`flex min-w-0 flex-1 items-center ${placeholderGapClass} rounded-md text-start transition-opacity active:opacity-60`}
              onClick={(e) => {
                e.stopPropagation();
                onPlayerTap?.(team, player.id);
              }}
            >
              <PlayerAvatar
                player={player}
                asDiv
                draggable={false}
                showName={false}
                inlineFace
                inlineFaceSize={faceSize}
                removable={false}
              />
              <span className={`${playerNameClass} ${showPlayerRemoveButton ? 'pe-9' : ''}`}>
                {playerName(player)}
              </span>
            </button>
            {showPlayerRemoveButton ? renderRemoveButton(team, player.id) : null}
          </>
        ) : player ? (
          <>
            <PlayerAvatar
              player={player}
              draggable={false}
              showName={false}
              inlineFace
              inlineFaceSize={faceSize}
              removable={false}
            />
            <span
              className={`${playerNameClass} ${showPlayerRemoveButton ? 'pe-9' : ''}`}
            >
              {playerName(player)}
            </span>
            {showPlayerRemoveButton ? renderRemoveButton(team, player.id) : null}
          </>
        ) : showPlaceholder && lineupEditable ? (
          <button
            type="button"
            className={`flex min-h-[32px] min-w-0 flex-1 items-center ${placeholderGapClass} rounded-md text-start transition-opacity active:opacity-60`}
            onClick={(e) => {
              e.stopPropagation();
              onPlayerPlaceholderClick(team);
            }}
          >
            <PlayerAvatar player={null} showName={false} inlineFace inlineFaceSize={faceSize} removable={false} />
            <span
              className={
                isTarget
                  ? 'truncate text-xs font-semibold text-primary-700 dark:text-primary-300'
                  : `truncate ${placeholderTextClass}`
              }
            >
              {isTarget ? t('gameResults.nextPick') : t('gameResults.addPlayer')}
            </span>
          </button>
        ) : showPlaceholder ? (
          <button
            type="button"
            className={`flex items-center ${placeholderGapClass} ${isEditing && canEditResults ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            onClick={(e) => {
              e.stopPropagation();
              if (isEditing && canEditResults) {
                onPlayerPlaceholderClick(team);
              }
            }}
          >
            <PlayerAvatar player={null} showName={false} inlineFace inlineFaceSize={faceSize} removable={false} />
            <span className={placeholderTextClass}>—</span>
          </button>
        ) : null}
      </div>
    );
  };

  const renderScoreButton = (team: 'teamA' | 'teamB', setIndex: number) => {
    const set = displaySets[setIndex];
    const own = team === 'teamA' ? set.teamA : set.teamB;
    const other = team === 'teamA' ? set.teamB : set.teamA;
    const isExtra = isSupplementalMatchSet(set);
    const shouldShowScore = set.teamA !== 0 || set.teamB !== 0 || !resultsFinal;
    const topBadge = set.isTieBreak
      ? isSuperTieBreakDeciderRow(rules, setIndex, set.isTieBreak)
        ? t('gameResults.superTieBreakAbbr')
        : t('gameResults.tieBreakAbbr')
      : null;
    const bottomBadge = isExtra
      ? set.role === 'EXTRA_BALLS'
        ? t('gameResults.extraUnitBallsAbbr')
        : t('gameResults.extraUnitGamesAbbr')
      : null;

    return (
      <div key={`${team}-set-${setIndex}`} className={scoreCellClass}>
        {shouldShowScore ? (
          <SetScoreTile
            value={own}
            state={getSetScoreTileState(own, other)}
            editable={canEditResults}
            isExtra={isExtra}
            size={tileSize}
            topBadge={topBadge}
            bottomBadge={bottomBadge}
            onClick={(e) => {
              e.stopPropagation();
              if (canEditResults) onSetClick(setIndex);
            }}
          />
        ) : null}
      </div>
    );
  };

  const gridTemplateColumns =
    setCount > 0
      ? `${playersCol} repeat(${setCount}, ${setCol})${showMatchActionsColumn ? ' auto' : ''}`
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
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all ${
            canEditResults
              ? 'cursor-pointer border-blue-200 bg-blue-50 text-blue-700 hover:scale-105 hover:bg-blue-100 active:scale-95 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50'
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
        {liveGameId ? <LivePlayLink gameId={liveGameId} matchId={match.id} /> : null}
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
    <motion.div
      ref={rootRef}
      layout
      initial={embedded ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      className={
        embedded
          ? 'relative min-w-0'
          : `relative min-w-0 rounded-2xl border bg-white px-2.5 pb-2.5 pt-2 shadow-sm transition-[border-color,box-shadow] duration-200 dark:bg-gray-800 ${
              isEditing && canEditResults
                ? 'border-primary-300 shadow-lg shadow-primary-500/10 ring-1 ring-primary-300/60 dark:border-primary-700 dark:ring-primary-700/50'
                : 'border-gray-200/90 hover:shadow-md dark:border-gray-700/80'
            }`
      }
      data-match-container
      data-results-match-id={match.id}
      data-match-density={density}
    >
      {(headerTrailing || !hideMatchIndex || matchInProgressHeader || matchFinished || resultsFinal) && (
        <div className="mb-1 flex min-h-[1.5rem] items-center gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {!hideMatchIndex ? (
              <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide tabular-nums leading-none text-gray-500 dark:bg-gray-700/70 dark:text-gray-300">
                {t('gameResults.match', { number: matchIndex + 1 })}
              </span>
            ) : null}
            <MatchResultsHeaderBadges
              showLivePulse={matchInProgressHeader}
              showCompletedCheck={matchFinished}
              gameResultsFinal={resultsFinal}
            />
          </div>
          {headerTrailing}
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
            ? 'rounded-xl bg-primary-50/60 py-3 dark:bg-primary-950/25'
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
        </motion.div>
        {showEnterScore ? (
          <EnterScoreRow
            matchId={match.id}
            liveGameId={liveGameId}
            onEnterScore={() => onSetClick(nextEntrySetIndex(match, rules) ?? 0)}
          />
        ) : null}
      </motion.div>
      {overlays}
    </motion.div>
  );
};
