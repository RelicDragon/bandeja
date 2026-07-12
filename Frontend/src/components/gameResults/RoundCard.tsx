import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Trash2, Plus } from 'lucide-react';
import { Round } from '@/types/gameResults';
import { BasicUser, Court, Game } from '@/types';
import { MatchCard } from './MatchCard';
import { HorizontalMatchCard } from './HorizontalMatchCard';
import { ConfirmationModal } from '@/components';
import {
  getRules,
  getRoundResultsHeaderTone,
  isResultsMatchFinished,
  type RoundResultsHeaderTone,
} from '@/utils/scoring';
import { isSupplementalMatchSet } from '@/utils/matchSetRole';

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
  game?: Pick<Game, 'scoringPreset' | 'matchTimedCapMinutes' | 'matchTimerEnabled' | 'fixedNumberOfSets' | 'maxTotalPointsPerSet' | 'maxPointsPerTeam' | 'winnerOfMatch' | 'ballsInGames' | 'deucesBeforeGoldenPoint' | 'pointsPerTie' | 'resultsStatus' | 'playersPerMatch' | 'sport'> | null;
  gameId?: string;
  onMatchTimerTransition?: (roundId: string, matchId: string, action: import('@/utils/matchTimer').MatchTimerAction) => void | Promise<void>;
}

const ROUND_HEADER_TONE: Record<
  RoundResultsHeaderTone,
  { bg: string; hover: string; borderIdle: string; badge: string; dot: string | null }
> = {
  neutral: {
    bg: 'bg-white dark:bg-gray-800',
    hover: 'hover:bg-gray-50/80 dark:hover:bg-gray-800',
    borderIdle: 'border-b border-gray-200 dark:border-gray-700',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    dot: null,
  },
  in_progress: {
    bg: 'bg-amber-50/90 dark:bg-amber-950/35',
    hover: 'hover:bg-amber-100/90 dark:hover:bg-amber-950/45',
    borderIdle: 'border-b border-amber-200/80 dark:border-amber-800/60',
    badge: 'bg-amber-200/70 text-amber-800 dark:bg-amber-800/50 dark:text-amber-200',
    dot: 'bg-amber-500',
  },
  complete: {
    bg: 'bg-emerald-50/85 dark:bg-emerald-950/30',
    hover: 'hover:bg-emerald-100/80 dark:hover:bg-emerald-950/40',
    borderIdle: 'border-b border-emerald-200/80 dark:border-emerald-800/50',
    badge: 'bg-emerald-200/70 text-emerald-800 dark:bg-emerald-800/50 dark:text-emerald-200',
    dot: 'bg-emerald-500',
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
            deucesBeforeGoldenPoint: null,
            pointsPerTie: 0,
            scoringPreset: null,
          } as Game)
      ),
    [game, fixedNumberOfSets]
  );

  const headerTone = useMemo(() => getRoundResultsHeaderTone(round, rules), [round, rules]);

  const matchProgress = useMemo(() => {
    const total = round.matches.length;
    const finished = round.matches.filter((m) => isResultsMatchFinished(m, rules)).length;
    return { total, finished };
  }, [round.matches, rules]);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const matchesContent = (
    <div className={hideFrame ? 'space-y-2' : 'space-y-2 px-2 py-2.5'}>
              {round.matches.map((match, matchIndex) => {
                const useHorizontalMatchCard =
                  fixedNumberOfSets === 1 &&
                  windowWidth >= 390 &&
                  !match.sets.some(isSupplementalMatchSet);

                return useHorizontalMatchCard ? (
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
                    onAddSupplementalSet={onAddSupplementalSet ? () => onAddSupplementalSet(match.id) : undefined}
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
                );
              })}

      {editingMatchId && canEditResults && (
        <div className="flex justify-center mt-4">
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              onAddMatch();
            }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40"
          >
            <Plus size={20} />
          </motion.button>
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
    <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-gray-50/80 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700/80 dark:bg-gray-900/40">
      <div
        className={`flex cursor-pointer items-center justify-between px-2.5 py-2 transition-colors ${toneStyle.bg} ${
          isExpanded ? 'border-b border-gray-200/80 dark:border-gray-700' : toneStyle.borderIdle
        } ${toneStyle.hover}`}
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2">
          <motion.span
            animate={{ rotate: isExpanded ? 0 : -90 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100/80 text-gray-500 dark:bg-gray-800/80 dark:text-gray-400"
          >
            <ChevronDown size={15} />
          </motion.span>
          <h3 className="flex items-center gap-1.5 font-semibold text-sm text-gray-900 dark:text-gray-100">
            {t('gameResults.round')}
            <span
              className={`flex h-6 min-w-6 items-center justify-center rounded-lg px-1.5 text-xs font-bold shadow-sm ${toneStyle.badge}`}
            >
              {roundIndex + 1}
            </span>
          </h3>
          {toneStyle.dot && (
            <span className="relative flex h-2 w-2">
              {headerTone === 'in_progress' && (
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${toneStyle.dot}`} />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${toneStyle.dot}`} />
            </span>
          )}
          {matchProgress.total > 1 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums text-gray-400 dark:text-gray-500">
              <span className="h-1 w-10 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <motion.span
                  className={`block h-full rounded-full ${
                    matchProgress.finished === matchProgress.total ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  initial={false}
                  animate={{ width: `${(matchProgress.finished / matchProgress.total) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                />
              </span>
              {matchProgress.finished}/{matchProgress.total}
            </span>
          )}
        </div>

        {showDeleteButton && (
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirmation(true);
            }}
            whileTap={{ scale: 0.9 }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          >
            <Trash2 size={16} />
          </motion.button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            {matchesContent}
          </motion.div>
        )}
      </AnimatePresence>

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

