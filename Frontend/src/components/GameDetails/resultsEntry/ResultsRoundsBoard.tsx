import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Sparkles } from 'lucide-react';
import { Game, BasicUser } from '@/types';
import type { Round } from '@/types/gameResults';
import type { useGameResultsEngine } from '@/hooks/useGameResultsEngine';
import type { useDragAndDrop } from '@/hooks/useDragAndDrop';
import type { ModalType } from '@/hooks/useModalManager';
import { useDesktop } from '@/hooks/useDesktop';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';
import { useGameResultsStore } from '@/services/gameResultsEngine';
import { shouldShowRoundAddedModal } from '@/utils/fivePlayerMatchCombinations';
import { getAvailablePlayers, canEnterResults, isPresetResultsRoster } from '@/utils/gameResultsHelpers';
import { maxPlayersPerTeamForGame } from '@/utils/matchFormat';
import { getRules, isResultsMatchFinished } from '@/utils/scoring';
import {
  autoFillLineup,
  isMatchLineupFull,
  moveToOtherTeam,
  nextEntrySetIndex,
  playerIdsInRound,
  resolveLineupTargetTeam,
  restoreRemovedPlayer,
  swapPlayersInRound,
  type ResultsTeam,
} from '@/utils/resultsBoardNavigation';
import { hapticSelection, hapticSuccess } from '@/utils/haptics';
import { ScoringRulebookBanner } from '@/components/gameResults/scoring';
import {
  RoundCard,
  AvailablePlayersFooter,
  FloatingDraggedPlayer,
} from '@/components/gameResults';
import { RoundNavigator } from '@/components/gameResults/RoundNavigator';
import { LineupPlayerSheet, type SwapCandidate } from '@/components/gameResults/LineupPlayerSheet';
import { scrollToResultsRound } from './scrollToResults';

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

interface PlayerSheetTarget {
  roundId: string;
  matchId: string;
  team: ResultsTeam;
  playerId: string;
}

const TRAY_CLEARANCE_PX = 240;

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
  const { openPlayerCard } = usePlayerCardModal();
  const isDesktop = useDesktop();
  const isLandscape = useIsLandscape();
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const { expandedRoundIds, editingMatchId } = engine;
  const isPresetGame = isPresetResultsRoster(players.length);
  const [lineupTarget, setLineupTarget] = useState<{ matchId: string; team: ResultsTeam } | null>(null);
  const [playerSheet, setPlayerSheet] = useState<PlayerSheetTarget | null>(null);
  // Separate from the target so the sheet keeps its content while it slides away.
  const [playerSheetOpen, setPlayerSheetOpen] = useState(false);
  const [navRoundId, setNavRoundId] = useState<string | null>(null);

  const rules = useMemo(() => getRules(currentGame), [currentGame]);
  const maxPerTeam = maxPlayersPerTeamForGame(currentGame, players.length);

  // Split view scrolls a panel below the app header; the phone layout scrolls the page under it.
  const stickyTop = isDesktop || isLandscape ? '0px' : 'calc(var(--app-header-height, 4rem) + env(safe-area-inset-top))';
  const showNavigator = displayRounds.length > 1;
  const roundScrollMargin = showNavigator ? `calc(${stickyTop} + 3.5rem)` : `calc(${stickyTop} + 0.5rem)`;

  const editingRound = editingMatchId
    ? rounds.find((r) => r.matches.some((m) => m.id === editingMatchId)) ?? null
    : null;
  const editingMatch = editingRound?.matches.find((m) => m.id === editingMatchId) ?? null;
  const targetTeam = editingMatch
    ? resolveLineupTargetTeam(
        editingMatch,
        lineupTarget?.matchId === editingMatch.id ? lineupTarget.team : null,
        maxPerTeam,
      )
    : null;
  const trayPlayers = useMemo(() => {
    if (!editingRound) return [];
    const placed = playerIdsInRound(editingRound);
    return players.filter((p) => !placed.has(p.id));
  }, [editingRound, players]);
  const showTray =
    canEditResultsForRounds && Boolean(editingMatch) && targetTeam !== null && trayPlayers.length > 0;

  const activeRoundId =
    navRoundId && displayRounds.some((r) => r.id === navRoundId)
      ? navRoundId
      : expandedRoundIds.find((id) => displayRounds.some((r) => r.id === id)) ?? null;

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

  // Leave lineup editing once every seat is filled (tray tap, search, drag or auto-fill),
  // but not when "Edit lineup" was opened on a match that was already full.
  const sawOpenSeatRef = useRef(false);
  useEffect(() => {
    sawOpenSeatRef.current = false;
  }, [editingMatchId]);
  useEffect(() => {
    if (!editingMatch) return;
    const full = isMatchLineupFull(editingMatch, maxPerTeam);
    if (!full) {
      sawOpenSeatRef.current = true;
      return;
    }
    if (sawOpenSeatRef.current) {
      sawOpenSeatRef.current = false;
      hapticSuccess();
      engine.setEditingMatchId(null);
    }
  }, [editingMatch, maxPerTeam, engine]);

  // Keep the match being edited above the player tray.
  useEffect(() => {
    if (!editingMatchId || !showTray) return;
    const frame = requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`[data-results-match-id="${editingMatchId}"]`);
      if (!card) return;
      if (card.getBoundingClientRect().bottom > window.innerHeight - TRAY_CLEARANCE_PX) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [editingMatchId, showTray]);

  const roundIdOfMatch = useCallback(
    (matchId: string) => rounds.find((r) => r.matches.some((m) => m.id === matchId))?.id ?? null,
    [rounds],
  );

  const handleMatchDrop = async (matchId: string, team: 'teamA' | 'teamB', draggedPlayer: string) => {
    const roundId = roundIdOfMatch(matchId) ?? (rounds.length > 0 ? rounds[0].id : null);
    if (!roundId) return;
    hapticSelection();
    await engine.addPlayerToTeam(roundId, matchId, team, draggedPlayer);
  };

  const handleTouchEndWrapper = (e: TouchEvent) => dragAndDrop.handleTouchEnd(e, handleMatchDrop);

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
    if (newRound) {
      setNavRoundId(newRound.id);
      scrollToResultsRound(newRound.id);
    }
    if (newRound && shouldShowRoundAddedModal(newRound, players.length)) onRoundAdded?.(newRound);
  };

  const selectRound = (roundId: string) => {
    setNavRoundId(roundId);
    if (!expandedRoundIds.includes(roundId)) {
      engine.setExpandedRoundIds([...expandedRoundIds, roundId]);
    }
    scrollToResultsRound(roundId);
  };

  const focusLineup = (matchId: string, team: ResultsTeam | null) => {
    engine.setEditingMatchId(matchId);
    setLineupTarget(team ? { matchId, team } : null);
  };

  const handlePlaceholderClick = async (roundId: string, matchId: string, team: ResultsTeam) => {
    if (!(canEdit && isEditingResults)) return;

    const availablePlayers = getAvailablePlayers(roundId, matchId, rounds, players);

    if (availablePlayers.length === 1) {
      hapticSelection();
      await engine.addPlayerToTeam(roundId, matchId, team, availablePlayers[0].id);
    } else if (availablePlayers.length === 0) {
      openModal({ type: 'player', matchTeam: { roundId, matchId, team } });
    } else {
      focusLineup(matchId, team);
    }
  };

  const handleMatchClick = (roundId: string, matchId: string) => {
    if (!canEditResultsForRounds || editingMatchId === matchId) return;
    const match = rounds.find((r) => r.id === roundId)?.matches.find((m) => m.id === matchId);
    if (!match) return;
    if (!isMatchLineupFull(match, maxPerTeam)) {
      focusLineup(matchId, null);
      return;
    }
    if (isResultsMatchFinished(match, rules)) return;
    const setIndex = nextEntrySetIndex(match, rules);
    if (setIndex !== null) openModal({ type: 'set', roundId, matchId, setIndex });
  };

  const placeFromTray = (playerId: string) => {
    if (!editingRound || !editingMatch) return;
    // Quick successive taps can outrun a re-render; resolve the side from the store.
    const latest = useGameResultsStore
      .getState()
      .rounds.find((r) => r.id === editingRound.id)
      ?.matches.find((m) => m.id === editingMatch.id);
    if (!latest) return;
    const team = resolveLineupTargetTeam(
      latest,
      lineupTarget?.matchId === latest.id ? lineupTarget.team : null,
      maxPerTeam,
    );
    if (!team) return;
    hapticSelection();
    void engine.addPlayerToTeam(editingRound.id, latest.id, team, playerId);
  };

  const autoFillEditingMatch = () => {
    if (!editingRound || !editingMatch) return;
    const update = autoFillLineup(
      editingMatch,
      trayPlayers.map((p) => p.id),
      maxPerTeam,
      targetTeam ?? 'teamA',
    );
    if (update) void engine.setMatchLineups(editingRound.id, [update]);
  };

  const sheetRound = playerSheet ? rounds.find((r) => r.id === playerSheet.roundId) ?? null : null;
  const sheetMatch = playerSheet ? sheetRound?.matches.find((m) => m.id === playerSheet.matchId) ?? null : null;
  const sheetPlayer = playerSheet ? players.find((p) => p.id === playerSheet.playerId) ?? null : null;
  const sheetValid = Boolean(sheetMatch && playerSheet && sheetMatch[playerSheet.team].includes(playerSheet.playerId));

  const teamLabel = useCallback(
    (team: ResultsTeam) => (team === 'teamA' ? t('gameResults.teamA') : t('gameResults.teamB')),
    [t],
  );

  const swapCandidates = useMemo<SwapCandidate[]>(() => {
    if (!playerSheet || !sheetRound || !sheetMatch) return [];
    const list: SwapCandidate[] = [];
    const byId = (id: string) => players.find((p) => p.id === id);
    const otherSide: ResultsTeam = playerSheet.team === 'teamA' ? 'teamB' : 'teamA';
    for (const id of sheetMatch[otherSide]) {
      const player = byId(id);
      if (player) list.push({ player, group: 'match', hint: teamLabel(otherSide) });
    }
    sheetRound.matches.forEach((match, index) => {
      if (match.id === sheetMatch.id) return;
      for (const team of ['teamA', 'teamB'] as const) {
        for (const id of match[team]) {
          const player = byId(id);
          if (player) {
            list.push({
              player,
              group: 'round',
              hint: `${t('gameResults.match', { number: index + 1 })} · ${teamLabel(team)}`,
            });
          }
        }
      }
    });
    const placed = playerIdsInRound(sheetRound);
    for (const player of players) {
      if (!placed.has(player.id)) {
        list.push({ player, group: 'resting', hint: t('gameResults.swapGroupResting') });
      }
    }
    return list;
  }, [playerSheet, sheetRound, sheetMatch, players, teamLabel, t]);

  const sheetDescription = useMemo(() => {
    if (!playerSheet || !sheetRound || !sheetMatch) return null;
    const roundNumber = rounds.findIndex((r) => r.id === sheetRound.id) + 1;
    const matchNumber = sheetRound.matches.findIndex((m) => m.id === sheetMatch.id) + 1;
    return [
      t('gameResults.roundNumber', { number: roundNumber }),
      t('gameResults.match', { number: matchNumber }),
      teamLabel(playerSheet.team),
    ].join(' · ');
  }, [playerSheet, sheetRound, sheetMatch, rounds, teamLabel, t]);

  const movePlayer = () => {
    if (!playerSheet || !sheetMatch) return;
    const update = moveToOtherTeam(sheetMatch, playerSheet.team, playerSheet.playerId, maxPerTeam);
    if (!update) return;
    hapticSelection();
    void engine.setMatchLineups(playerSheet.roundId, [update]);
  };

  const swapPlayer = (otherPlayerId: string) => {
    if (!playerSheet || !sheetRound) return;
    const updates = swapPlayersInRound(sheetRound, playerSheet, otherPlayerId);
    if (updates.length === 0) return;
    hapticSelection();
    void engine.setMatchLineups(playerSheet.roundId, updates);
  };

  const removePlayer = () => {
    if (!playerSheet || !sheetMatch) return;
    const seat = {
      matchId: playerSheet.matchId,
      team: playerSheet.team,
      index: sheetMatch[playerSheet.team].indexOf(playerSheet.playerId),
      playerId: playerSheet.playerId,
    };
    const roundId = playerSheet.roundId;
    const name = sheetPlayer?.firstName || sheetPlayer?.lastName || '';
    void engine.removePlayerFromTeam(roundId, seat.matchId, seat.team, seat.playerId);
    toast.custom(
      (toastApi) => (
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-gray-900 py-2 pe-2 ps-4 text-sm text-white shadow-lg dark:bg-gray-700">
          <span className="min-w-0 truncate">{t('gameResults.playerRemoved', { name })}</span>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(toastApi.id);
              const round = useGameResultsStore.getState().rounds.find((r) => r.id === roundId);
              const restore = round ? restoreRemovedPlayer(round, seat, maxPerTeam) : null;
              if (restore) void engine.setMatchLineups(roundId, [restore]);
            }}
            className="h-9 shrink-0 rounded-xl px-3 font-semibold text-primary-300 transition-colors hover:bg-white/10"
          >
            {t('gameResults.undo')}
          </button>
        </div>
      ),
      { duration: 5000 },
    );
  };

  return (
    <div
      ref={resultsContainerRef}
      className={`w-full ${
        dragAndDrop.isDragging ? 'overflow-hidden' : ''
      } ${isSendingToTelegram ? 'pointer-events-none opacity-60' : ''} ${showTray ? 'pb-56' : 'pb-4'} transition-opacity duration-300`}
      onDragOver={dragAndDrop.handleDragOver}
      onClick={handleContainerClick}
    >
      <div className="space-y-2.5 pt-0 pb-2">
        {canEdit && isEditingResults && !isSendingToTelegram && currentGame?.scoringPreset && (
          <ScoringRulebookBanner game={currentGame} />
        )}
        {showNavigator ? (
          <RoundNavigator
            rounds={displayRounds}
            allRounds={rounds}
            rules={rules}
            activeRoundId={activeRoundId}
            onSelect={selectRound}
            onAddRound={canEditResultsForRounds ? () => void handleAddRound() : undefined}
            stickyTop={stickyTop}
          />
        ) : null}
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
            scrollMarginTop={roundScrollMargin}
            onRemoveRound={() => engine.removeRound(round.id)}
            onToggleExpand={() => {
              if (expandedRoundIds.includes(round.id)) {
                const roundHasEditingMatch = round.matches.some((m) => m.id === editingMatchId);
                if (roundHasEditingMatch) engine.setEditingMatchId(null);
              } else {
                setNavRoundId(round.id);
              }
              engine.toggleRoundExpanded(round.id);
            }}
            onAddMatch={() => engine.addMatch(round.id)}
            onRemoveMatch={(matchId) => engine.removeMatch(round.id, matchId)}
            onMatchClick={(matchId) => handleMatchClick(round.id, matchId)}
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
              hapticSelection();
              engine.addPlayerToTeam(round.id, matchId, team, dragAndDrop.draggedPlayer);
              dragAndDrop.handleDragEnd();
            }}
            onPlayerPlaceholderClick={(matchId, team) => void handlePlaceholderClick(round.id, matchId, team)}
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
            onEditLineup={canEditResultsForRounds ? (matchId) => focusLineup(matchId, null) : undefined}
            onPlayerTap={
              canEditResultsForRounds
                ? (matchId, team, playerId) => {
                    setPlayerSheet({ roundId: round.id, matchId, team, playerId });
                    setPlayerSheetOpen(true);
                  }
                : undefined
            }
            lineupTargetTeam={targetTeam}
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
      </div>

      <AnimatePresence>
        {showTray && editingMatch && targetTeam ? (
          <AvailablePlayersFooter
            key="player-tray"
            availablePlayers={trayPlayers}
            editingMatch={editingMatch}
            maxPlayersPerTeam={maxPerTeam}
            draggedPlayer={dragAndDrop.draggedPlayer}
            targetTeam={targetTeam}
            onTargetTeamChange={(team) => setLineupTarget({ matchId: editingMatch.id, team })}
            onPlace={placeFromTray}
            onAutoFill={autoFillEditingMatch}
            onSearch={() => {
              if (!editingRound) return;
              openModal({
                type: 'player',
                matchTeam: { roundId: editingRound.id, matchId: editingMatch.id, team: targetTeam },
              });
            }}
            onDragStart={dragAndDrop.handleDragStart}
            onDragEnd={dragAndDrop.handleDragEnd}
            onTouchStart={dragAndDrop.handleTouchStart}
            onTouchMove={dragAndDrop.handleTouchMove}
            onTouchEnd={handleTouchEndWrapper}
          />
        ) : null}
      </AnimatePresence>

      <span className="contents" onClick={(e) => e.stopPropagation()}>
        <LineupPlayerSheet
          open={playerSheetOpen && sheetValid}
          onOpenChange={setPlayerSheetOpen}
          player={sheetPlayer}
          description={sheetDescription}
          team={playerSheet?.team ?? null}
          canMove={Boolean(
            playerSheet && sheetMatch && moveToOtherTeam(sheetMatch, playerSheet.team, playerSheet.playerId, maxPerTeam),
          )}
          swapCandidates={swapCandidates}
          onMove={movePlayer}
          onSwap={swapPlayer}
          onRemove={removePlayer}
          onViewProfile={() => {
            if (playerSheet) openPlayerCard(playerSheet.playerId);
          }}
        />
      </span>

      {dragAndDrop.draggedPlayer && dragAndDrop.dragPosition && (
        <FloatingDraggedPlayer
          player={players.find((p) => p.id === dragAndDrop.draggedPlayer) || null}
          position={dragAndDrop.dragPosition}
        />
      )}
    </div>
  );
};
