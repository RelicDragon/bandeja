import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, Sparkles } from 'lucide-react';
import { Game, BasicUser } from '@/types';
import type { Round } from '@/types/gameResults';
import type { useGameResultsEngine } from '@/hooks/useGameResultsEngine';
import type { useDragAndDrop } from '@/hooks/useDragAndDrop';
import type { ModalType } from '@/hooks/useModalManager';
import { useGameResultsStore } from '@/services/gameResultsEngine';
import { shouldShowRoundAddedModal } from '@/utils/fivePlayerMatchCombinations';
import { getAvailablePlayers, canEnterResults, isPresetResultsRoster } from '@/utils/gameResultsHelpers';
import { ScoringRulebookBanner } from '@/components/gameResults/scoring';
import {
  RoundCard,
  AvailablePlayersFooter,
  FloatingDraggedPlayer,
} from '@/components/gameResults';

type Engine = ReturnType<typeof useGameResultsEngine>;
type DragAndDrop = ReturnType<typeof useDragAndDrop>;

interface ResultsRoundsBoardProps {
  currentGame: Game | null;
  players: BasicUser[];
  rounds: Round[];
  displayRounds: Round[];
  engine: Engine;
  dragAndDrop: DragAndDrop;
  canEdit: boolean;
  isEditingResults: boolean;
  isSendingToTelegram: boolean;
  canEditResultsForRounds: boolean;
  showCreateAllCombinationsButton: boolean;
  isCreatingAllCombinations: boolean;
  effectiveShowCourts: boolean;
  onCreateAllCombinations: () => void;
  openModal: (modal: ModalType) => void;
  onAddSupplementalSet: (roundId: string, matchId: string) => void;
  onRoundAdded?: (round: Round) => void;
}

export const ResultsRoundsBoard = ({
  currentGame,
  players,
  rounds,
  displayRounds,
  engine,
  dragAndDrop,
  canEdit,
  isEditingResults,
  isSendingToTelegram,
  canEditResultsForRounds,
  showCreateAllCombinationsButton,
  isCreatingAllCombinations,
  effectiveShowCourts,
  onCreateAllCombinations,
  openModal,
  onAddSupplementalSet,
  onRoundAdded,
}: ResultsRoundsBoardProps) => {
  const { t } = useTranslation();
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const { expandedRoundIds, editingMatchId } = engine;
  const isPresetGame = isPresetResultsRoster(players.length);

  useEffect(() => {
    const isDragging = dragAndDrop.draggedPlayer !== null || dragAndDrop.isDragging;

    if (isDragging) {
      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;
      const scrollY = window.scrollY;

      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.width = '';
        document.body.style.top = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [dragAndDrop.draggedPlayer, dragAndDrop.isDragging]);

  const handleMatchDrop = async (matchId: string, team: 'teamA' | 'teamB', draggedPlayer: string) => {
    const roundId =
      rounds.find((r) => r.matches.some((m) => m.id === matchId))?.id ??
      (rounds.length > 0 ? rounds[0].id : null);
    if (!roundId) return;
    await engine.addPlayerToTeam(roundId, matchId, team, draggedPlayer);
  };

  const handleTouchEndWrapper = (e: TouchEvent) => {
    dragAndDrop.handleTouchEnd(e, handleMatchDrop);
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (editingMatchId && canEdit && isEditingResults) {
      const target = e.target as HTMLElement;
      const isClickInsideMatch = target.closest('[data-match-container]');
      if (!isClickInsideMatch) {
        engine.setEditingMatchId(null);
      }
    }
  };

  const initializeRoundsIfNeeded = async () => {
    const shouldInitialize =
      engine.initialized &&
      rounds.length === 0 &&
      canEdit &&
      currentGame?.resultsStatus !== 'NONE' &&
      currentGame?.resultsStatus !== 'FINAL';

    if (shouldInitialize && rounds.length === 0) {
      if (isPresetGame) {
        await engine.initializePresetMatches();
      } else {
        await engine.initializeDefaultRound();
      }
    }
  };

  const handleAddRound = async () => {
    await initializeRoundsIfNeeded();
    await engine.addRound();
    const nextRounds = useGameResultsStore.getState().rounds;
    const newRound = nextRounds.length > 0 ? nextRounds[nextRounds.length - 1] : undefined;
    if (newRound && shouldShowRoundAddedModal(newRound)) onRoundAdded?.(newRound);
  };

  return (
    <div
      ref={resultsContainerRef}
      className={`scrollbar-hide w-full space-y-2 hover:scrollbar-thin hover:scrollbar-thumb-gray-300 dark:hover:scrollbar-thumb-gray-600 ${
        dragAndDrop.isDragging ? 'overflow-hidden' : ''
      } ${isSendingToTelegram ? 'pointer-events-none opacity-60' : ''} pb-4 transition-opacity duration-300`}
      onDragOver={dragAndDrop.handleDragOver}
      onClick={handleContainerClick}
    >
      <div className="space-y-2.5 pt-0 pb-2">
        {canEdit && isEditingResults && !isSendingToTelegram && currentGame?.scoringPreset && (
          <ScoringRulebookBanner game={currentGame} />
        )}
        {showCreateAllCombinationsButton && (
          <div className="flex justify-center pb-2">
            <motion.button
              type="button"
              onClick={onCreateAllCombinations}
              disabled={isCreatingAllCombinations}
              whileTap={isCreatingAllCombinations ? undefined : { scale: 0.97 }}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2.5 font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:from-indigo-600 hover:to-violet-700 hover:shadow-xl hover:shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={16} className="shrink-0" aria-hidden />
              {isCreatingAllCombinations
                ? t('common.loading')
                : t('gameResults.createAllCombinations')}
            </motion.button>
          </div>
        )}
        {displayRounds.map((round) => (
          <RoundCard
            key={round.id}
            round={round}
            roundIndex={Math.max(0, rounds.findIndex((r) => r.id === round.id))}
            players={players}
            isExpanded={expandedRoundIds.includes(round.id)}
            canEditResults={canEditResultsForRounds}
            editingMatchId={editingMatchId}
            draggedPlayer={dragAndDrop.draggedPlayer}
            showDeleteButton={rounds.length > 1 && canEdit && isEditingResults && !isSendingToTelegram}
            hideFrame={displayRounds.length === 1}
            onRemoveRound={() => engine.removeRound(round.id)}
            onToggleExpand={() => {
              if (expandedRoundIds.includes(round.id)) {
                const roundHasEditingMatch = round.matches.some((m) => m.id === editingMatchId);
                if (roundHasEditingMatch) engine.setEditingMatchId(null);
              }
              engine.toggleRoundExpanded(round.id);
            }}
            onAddMatch={() => engine.addMatch(round.id)}
            onRemoveMatch={(matchId) => engine.removeMatch(round.id, matchId)}
            onMatchClick={(matchId) => {
              engine.setEditingMatchId(matchId);
            }}
            onCancelMatchEdit={() => {
              engine.setEditingMatchId(null);
            }}
            onSetClick={(matchId, setIndex) =>
              openModal({ type: 'set', roundId: round.id, matchId, setIndex })
            }
            onAddSupplementalSet={(matchId) => onAddSupplementalSet(round.id, matchId)}
            onRemovePlayer={(matchId, team, playerId) =>
              engine.removePlayerFromTeam(round.id, matchId, team, playerId)
            }
            onDragOver={dragAndDrop.handleDragOver}
            onDrop={(e, matchId, team) => {
              if (e) e.preventDefault();
              if (!dragAndDrop.draggedPlayer) return;
              engine.addPlayerToTeam(round.id, matchId, team, dragAndDrop.draggedPlayer);
              dragAndDrop.handleDragEnd();
            }}
            onPlayerPlaceholderClick={async (matchId, team) => {
              if (!(canEdit && isEditingResults)) return;

              const availablePlayers = getAvailablePlayers(round.id, matchId, rounds, players);

              if (availablePlayers.length === 1) {
                await engine.addPlayerToTeam(round.id, matchId, team, availablePlayers[0].id);
              } else {
                openModal({ type: 'player', matchTeam: { roundId: round.id, matchId, team } });
              }
            }}
            canEnterResults={(matchId) => {
              const match = round.matches.find((m) => m.id === matchId);
              return match ? canEnterResults(match) : false;
            }}
            showCourtLabel={effectiveShowCourts}
            courts={currentGame?.gameCourts?.map((gc) => gc.court) || []}
            onCourtClick={(matchId) => openModal({ type: 'court', match: { roundId: round.id, matchId } })}
            fixedNumberOfSets={currentGame?.fixedNumberOfSets}
            game={currentGame}
            gameId={currentGame?.id}
            onMatchTimerTransition={(rId, mId, action) => engine.transitionMatchTimer(rId, mId, action)}
          />
        ))}

        {canEdit && isEditingResults && !isSendingToTelegram && (
          <div className="flex justify-center">
            <motion.button
              onClick={() => void handleAddRound()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="group inline-flex items-center gap-2 rounded-2xl border-2 border-dashed border-primary-300 bg-primary-50/50 px-6 py-3 font-semibold text-primary-600 transition-colors hover:border-primary-400 hover:bg-primary-100/70 hover:text-primary-700 dark:border-primary-700 dark:bg-primary-950/30 dark:text-primary-300 dark:hover:border-primary-600 dark:hover:bg-primary-950/50 dark:hover:text-primary-200"
            >
              <Plus
                size={18}
                className="shrink-0 transition-transform duration-300 group-hover:rotate-90"
                aria-hidden
              />
              {t('gameResults.addRound')}
            </motion.button>
          </div>
        )}

        {editingMatchId &&
          canEdit &&
          isEditingResults &&
          !isSendingToTelegram &&
          (() => {
            const expandedRound = rounds.find((r) => r.matches.some((m) => m.id === editingMatchId));
            const editingMatch = expandedRound?.matches.find((m) => m.id === editingMatchId);
            if (!expandedRound || !editingMatch) return null;

            return (
              <AvailablePlayersFooter
                players={players}
                editingMatch={editingMatch}
                roundMatches={expandedRound.matches}
                draggedPlayer={dragAndDrop.draggedPlayer}
                playersPerMatch={currentGame?.playersPerMatch}
                sport={currentGame?.sport}
                onDragStart={dragAndDrop.handleDragStart}
                onDragEnd={dragAndDrop.handleDragEnd}
                onTouchStart={dragAndDrop.handleTouchStart}
                onTouchMove={dragAndDrop.handleTouchMove}
                onTouchEnd={handleTouchEndWrapper}
              />
            );
          })()}
      </div>

      {dragAndDrop.draggedPlayer && dragAndDrop.dragPosition && (
        <FloatingDraggedPlayer
          player={players.find((p) => p.id === dragAndDrop.draggedPlayer) || null}
          position={dragAndDrop.dragPosition}
        />
      )}
    </div>
  );
};
