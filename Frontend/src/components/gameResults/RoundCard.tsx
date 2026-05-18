import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Trash2, Plus } from 'lucide-react';
import { Round } from '@/types/gameResults';
import { BasicUser, Court, Game } from '@/types';
import { MatchCard } from './MatchCard';
import { HorizontalMatchCard } from './HorizontalMatchCard';
import { ConfirmationModal } from '@/components';
import { getRules, getRoundResultsHeaderTone, type RoundResultsHeaderTone } from '@/utils/scoring';

interface RoundCardProps {
  round: Round;
  roundIndex: number;
  players: BasicUser[];
  isExpanded: boolean;
  canEditResults: boolean;
  editingMatchId: string | null;
  draggedPlayer: string | null;
  showDeleteButton: boolean;
  hideFrame?: boolean;
  onRemoveRound: () => void;
  onToggleExpand: () => void;
  onAddMatch: () => void;
  onRemoveMatch: (matchId: string) => void;
  onMatchClick: (matchId: string) => void;
  onCancelMatchEdit: () => void;
  onSetClick: (matchId: string, setIndex: number) => void;
  onAddSupplementalSet?: (matchId: string) => void;
  onRemovePlayer: (matchId: string, team: 'teamA' | 'teamB', playerId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, matchId: string, team: 'teamA' | 'teamB') => void;
  onPlayerPlaceholderClick: (matchId: string, team: 'teamA' | 'teamB') => void;
  canEnterResults: (matchId: string) => boolean;
  showCourtLabel?: boolean;
  courts?: Court[];
  onCourtClick?: (matchId: string) => void;
  fixedNumberOfSets?: number;
  game?: Pick<Game, 'scoringPreset' | 'matchTimedCapMinutes' | 'fixedNumberOfSets' | 'maxTotalPointsPerSet' | 'maxPointsPerTeam' | 'winnerOfMatch' | 'ballsInGames' | 'hasGoldenPoint' | 'pointsPerTie' | 'resultsStatus'> | null;
  gameId?: string;
  onMatchTimerTransition?: (roundId: string, matchId: string, action: import('@/utils/matchTimer').MatchTimerAction) => void | Promise<void>;
}

const ROUND_HEADER_TONE: Record<
  RoundResultsHeaderTone,
  { bg: string; hover: string; borderIdle: string }
> = {
  neutral: {
    bg: 'bg-white dark:bg-gray-800',
    hover: 'hover:bg-gray-50/80 dark:hover:bg-gray-800',
    borderIdle: 'border-b border-gray-200 dark:border-gray-700',
  },
  in_progress: {
    bg: 'bg-amber-50/90 dark:bg-amber-950/35',
    hover: 'hover:bg-amber-100/90 dark:hover:bg-amber-950/45',
    borderIdle: 'border-b border-amber-200/80 dark:border-amber-800/60',
  },
  complete: {
    bg: 'bg-emerald-50/85 dark:bg-emerald-950/30',
    hover: 'hover:bg-emerald-100/80 dark:hover:bg-emerald-950/40',
    borderIdle: 'border-b border-emerald-200/80 dark:border-emerald-800/50',
  },
};

export const RoundCard = ({
  round,
  roundIndex,
  players,
  isExpanded,
  canEditResults,
  editingMatchId,
  draggedPlayer,
  showDeleteButton,
  hideFrame = false,
  onRemoveRound,
  onToggleExpand,
  onAddMatch,
  onRemoveMatch,
  onMatchClick,
  onCancelMatchEdit,
  onSetClick,
  onAddSupplementalSet,
  onRemovePlayer,
  onDragOver,
  onDrop,
  onPlayerPlaceholderClick,
  canEnterResults,
  showCourtLabel = false,
  courts = [],
  onCourtClick,
  fixedNumberOfSets,
  game,
  gameId,
  onMatchTimerTransition,
}: RoundCardProps) => {
  const { t } = useTranslation();
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const roundName = `${t('gameResults.round')} ${roundIndex + 1}`;

  const rules = useMemo(
    () =>
      getRules(
        game ??
          ({
            fixedNumberOfSets,
            maxTotalPointsPerSet: 0,
            maxPointsPerTeam: 0,
            winnerOfMatch: 'BY_SCORES',
            ballsInGames: false,
            hasGoldenPoint: false,
            pointsPerTie: 0,
            scoringPreset: null,
          } as Game)
      ),
    [game, fixedNumberOfSets]
  );

  const headerTone = useMemo(() => getRoundResultsHeaderTone(round, rules), [round, rules]);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const matchesContent = (
    <div className={hideFrame ? '' : 'py-2'}>
              {round.matches.map((match, matchIndex) => (
                fixedNumberOfSets === 1 && windowWidth >= 390 ? (
                  <HorizontalMatchCard
                    key={match.id}
                    match={match}
                    matchIndex={matchIndex}
                    players={players}
                    isEditing={editingMatchId === match.id}
                    canEditResults={canEditResults}
                    draggedPlayer={draggedPlayer}
                    showHeaderEditButton={canEditResults}
                    showDeleteButton={round.matches.length > 1 && canEditResults}
                    onRemoveMatch={() => onRemoveMatch(match.id)}
                    onMatchClick={() => onMatchClick(match.id)}
                    onCancelMatchEdit={onCancelMatchEdit}
                    onSetClick={(setIndex) => onSetClick(match.id, setIndex)}
                    onRemovePlayer={(team, playerId) => onRemovePlayer(match.id, team, playerId)}
                    onDragOver={onDragOver}
                    onDrop={(e, team) => onDrop(e, match.id, team)}
                    onPlayerPlaceholderClick={(team) => onPlayerPlaceholderClick(match.id, team)}
                    canEnterResults={canEnterResults(match.id)}
                    showCourtLabel={showCourtLabel}
                    selectedCourt={courts?.find(c => c.id === match.courtId) || null}
                    courts={courts}
                    onCourtClick={() => onCourtClick && onCourtClick(match.id)}
                    fixedNumberOfSets={fixedNumberOfSets}
                    game={game}
                    roundId={round.id}
                    gameId={gameId}
                    onMatchTimerTransition={onMatchTimerTransition}
                  />
                ) : (
                  <MatchCard
                    key={match.id}
                    match={match}
                    matchIndex={matchIndex}
                    players={players}
                    isEditing={editingMatchId === match.id}
                    canEditResults={canEditResults}
                    draggedPlayer={draggedPlayer}
                    showHeaderEditButton={canEditResults}
                    showDeleteButton={round.matches.length > 1 && canEditResults}
                    onRemoveMatch={() => onRemoveMatch(match.id)}
                    onMatchClick={() => onMatchClick(match.id)}
                    onCancelMatchEdit={onCancelMatchEdit}
                    onSetClick={(setIndex) => onSetClick(match.id, setIndex)}
                    onAddSupplementalSet={onAddSupplementalSet ? () => onAddSupplementalSet(match.id) : undefined}
                    onRemovePlayer={(team, playerId) => onRemovePlayer(match.id, team, playerId)}
                    onDragOver={onDragOver}
                    onDrop={(e, team) => onDrop(e, match.id, team)}
                    onPlayerPlaceholderClick={(team) => onPlayerPlaceholderClick(match.id, team)}
                    canEnterResults={canEnterResults(match.id)}
                    showCourtLabel={showCourtLabel}
                    selectedCourt={courts?.find(c => c.id === match.courtId) || null}
                    courts={courts}
                    onCourtClick={() => onCourtClick && onCourtClick(match.id)}
                    fixedNumberOfSets={fixedNumberOfSets}
                    game={game}
                    roundId={round.id}
                    gameId={gameId}
                    onMatchTimerTransition={onMatchTimerTransition}
                  />
                )
              ))}

      {editingMatchId && canEditResults && (
        <div className="flex justify-center mt-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddMatch();
            }}
            className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-colors shadow-lg"
          >
            <Plus size={20} />
          </button>
        </div>
      )}
    </div>
  );

  if (hideFrame) {
    return (
      <>
        {matchesContent}
        {showDeleteConfirmation && (
          <ConfirmationModal
            isOpen={showDeleteConfirmation}
            title={t('gameResults.deleteRound')}
            message={t('gameResults.deleteRoundConfirmation')}
            highlightedText={roundName}
            confirmText={t('common.delete')}
            cancelText={t('common.cancel')}
            confirmVariant="danger"
            onConfirm={onRemoveRound}
            onClose={() => setShowDeleteConfirmation(false)}
          />
        )}
      </>
    );
  }

  const toneStyle = ROUND_HEADER_TONE[headerTone];

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm transition-colors dark:border-gray-700 dark:bg-gray-800">
      <div
        className={`flex cursor-pointer items-center justify-between rounded-t-lg transition-colors ${toneStyle.bg} ${
          isExpanded ? 'border-b border-gray-200 dark:border-gray-600' : toneStyle.borderIdle
        } ${toneStyle.hover}`}
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-1">
          {isExpanded ? (
            <ChevronDown size={16} className="text-gray-600 dark:text-gray-400" />
          ) : (
            <ChevronRight size={16} className="text-gray-600 dark:text-gray-400" />
          )}
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            {roundName}
          </h3>
        </div>

        {showDeleteButton && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirmation(true);
            }}
            className="w-8 h-8 rounded-full border-2 border-red-500 hover:border-red-600 bg-white dark:bg-gray-800 text-red-500 hover:text-red-600 flex items-center justify-center transition-colors shadow-lg"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {matchesContent}
        </div>
      )}

      {showDeleteConfirmation && (
        <ConfirmationModal
          isOpen={showDeleteConfirmation}
          title={t('gameResults.deleteRound')}
          message={t('gameResults.deleteRoundConfirmation')}
          highlightedText={roundName}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmVariant="danger"
          onConfirm={onRemoveRound}
          onClose={() => setShowDeleteConfirmation(false)}
        />
      )}
    </div>
  );
};

