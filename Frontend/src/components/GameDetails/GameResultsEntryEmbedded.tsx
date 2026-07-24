import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { OutcomesDisplay } from '@/components';
import { BasicUser, Game } from '@/types';
import type { Round } from '@/types/gameResults';
import { useAuthStore } from '@/store/authStore';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useGameResultsEngine } from '@/hooks/useGameResultsEngine';
import { useModalManager } from '@/hooks/useModalManager';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useOfflineMessage } from '@/hooks/useOfflineMessage';
import { useGameResultsTabs } from '@/hooks/useGameResultsTabs';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { GameResultsEngine } from '@/services/gameResultsEngine';
import { ResultsStorage } from '@/services/resultsStorage';
import { canShowTournamentTableView } from '@/utils/gameResults';
import {
  getRules,
  isResultsMatchFinished,
  isResultsMatchInProgressForResultsHeader,
  matchSetsHaveAnyNonZeroScore,
} from '@/utils/scoring';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { userIsPlayingInGameOrParent } from '@/utils/gameParticipationState';
import {
  resolveCurrentGameForResults,
  shouldSyncEngineGameFromShell,
} from '@/utils/mergeGameFormatForResults';
import { canCreateAllFivePlayerCombinations } from '@/utils/fivePlayerMatchCombinations';
import { resolveGameBracketReturnTarget } from '@/utils/gameBracketReturn.util';
import { PlayerStatsPanel } from '@/components/gameResults';
import { GameResultsTabs } from './GameResultsTabs';
import { OfflineBanner } from './OfflineBanner';
import { GameResultsModals } from './GameResultsModals';
import { GameWorkoutSummaryCard } from './GameWorkoutSummaryCard';
import { PlayStreakResultsBanner } from '@/components/playStreak/PlayStreakResultsBanner';
import { GameResultsShareCard } from './GameResultsShareCard';
import { GameResultsShowInStoriesSwitch } from './GameResultsShowInStoriesSwitch';
import { useGameDetailsChromeStore } from './gameDetailsChromeStore';
import { ResultsLoadingState } from './resultsEntry/ResultsLoadingState';
import { BracketReturnBar } from './resultsEntry/BracketReturnBar';
import { ResultsTelegramSection } from './resultsEntry/ResultsTelegramSection';
import { ResultsFooterActions } from './resultsEntry/ResultsFooterActions';
import { ResultsRoundsBoard } from './resultsEntry/ResultsRoundsBoard';
import { useResultsArtifactsTelegram } from './resultsEntry/useResultsArtifactsTelegram';
import { useSetEntryOperations } from './resultsEntry/useSetEntryOperations';
import { useResultsLifecycle } from './resultsEntry/useResultsLifecycle';

interface GameResultsEntryEmbeddedProps {
  game: Game;
  onGameUpdate: (game: Game) => void;
  onRoundAdded?: (round: Round) => void;
}

const TAB_CONTENT_MOTION = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { type: 'tween' as const, duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const },
};

export const GameResultsEntryEmbedded = ({
  game,
  onGameUpdate,
  onRoundAdded,
}: GameResultsEntryEmbeddedProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [canInitialize, setCanInitialize] = useState<boolean | null>(null);
  const [isCreatingAllCombinations, setIsCreatingAllCombinations] = useState(false);
  const mountedRef = useRef(false);

  const engine = useGameResultsEngine({
    gameId: canInitialize === true ? game.id : undefined,
    userId: canInitialize === true ? user?.id || '' : undefined,
  });

  const { modal, openModal, closeModal } = useModalManager();
  const { loading, setLoadingState } = useLoadingState();
  const { showOfflineMessage, toggleMessage } = useOfflineMessage(engine.serverProblem);

  const currentGame = useMemo(
    () => resolveCurrentGameForResults(game, engine.game),
    [engine.game, game]
  );

  const bracketReturnTarget = useMemo(
    () => resolveGameBracketReturnTarget(currentGame ?? game),
    [currentGame, game]
  );

  const { activeTab, setActiveTab } = useGameResultsTabs(currentGame?.resultsStatus);

  const canEdit = engine.canEdit;
  const engineLoading = engine.loading;
  const expandedRoundIds = engine.expandedRoundIds;
  const editingMatchId = engine.editingMatchId;
  const serverProblem = engine.serverProblem;
  const rounds = engine.rounds;

  const players = useMemo(
    () =>
      (currentGame?.participants?.filter(isParticipantPlaying).map((p) => p.user) ??
        []) as BasicUser[],
    [currentGame?.participants]
  );

  const showWorkoutSummaryCard = useMemo(
    () => userIsPlayingInGameOrParent(currentGame, user?.id),
    [currentGame, user?.id]
  );

  const isResultsEntryMode = currentGame?.resultsStatus !== 'NONE' || rounds.length > 0;
  const isFinalStatus = currentGame?.resultsStatus === 'FINAL';

  const isEditingResults = useMemo(() => {
    if (!engine.initialized) return false;
    const hasResults = currentGame?.resultsStatus !== 'NONE';
    return hasResults && !isFinalStatus && canEdit;
  }, [engine.initialized, currentGame?.resultsStatus, isFinalStatus, canEdit]);

  const telegram = useResultsArtifactsTelegram({
    currentGame,
    rounds,
    user,
    onGameUpdate,
  });
  const isSendingToTelegram = telegram.isSendingToTelegram;

  const lifecycle = useResultsLifecycle({
    game,
    user,
    engine,
    setLoadingState,
    closeModal,
    onGameUpdate,
    setActiveTab,
    setCanInitialize,
  });

  const onSupplementalSetAdded = useCallback(
    (roundId: string, matchId: string, setIndex: number) => {
      openModal({ type: 'set', roundId, matchId, setIndex });
    },
    [openModal]
  );

  const setOps = useSetEntryOperations({
    rounds,
    updateMatch: engine.updateMatch,
    onSupplementalSetAdded,
  });

  const showCreateAllCombinationsButton = useMemo(
    () =>
      canEdit &&
      isEditingResults &&
      !isSendingToTelegram &&
      canCreateAllFivePlayerCombinations(
        players.length,
        Boolean(currentGame?.hasFixedTeams),
        rounds
      ),
    [canEdit, isEditingResults, isSendingToTelegram, players.length, currentGame?.hasFixedTeams, rounds]
  );

  const canEditResultsForRounds = useMemo(
    () => canEdit && isEditingResults && isResultsEntryMode && !isSendingToTelegram,
    [canEdit, isEditingResults, isResultsEntryMode, isSendingToTelegram]
  );

  const displayRounds = useMemo(() => {
    if (canEditResultsForRounds) return rounds;
    const rules = currentGame ? getRules(currentGame) : null;
    return rounds.filter((r) =>
      r.matches.some((m) => {
        if (!rules) {
          return (m.sets ?? []).some((s) => s.teamA > 0 || s.teamB > 0);
        }
        return (
          matchSetsHaveAnyNonZeroScore(m.sets) ||
          isResultsMatchFinished(m, rules) ||
          isResultsMatchInProgressForResultsHeader(m, rules)
        );
      })
    );
  }, [rounds, canEditResultsForRounds, currentGame]);

  const hasMatchesWithTeamsReady = useMemo(() => {
    if (rounds.length === 0) return false;
    return rounds.some((round) =>
      round.matches.some((match) => match.teamA.length > 0 && match.teamB.length > 0)
    );
  }, [rounds]);

  const showFinishButton =
    canEdit &&
    isEditingResults &&
    isResultsEntryMode &&
    rounds.length > 0 &&
    rounds.some((r) => r.matches.length > 0) &&
    hasMatchesWithTeamsReady;
  const showEditButton =
    canEdit &&
    !isEditingResults &&
    isFinalStatus &&
    isResultsEntryMode &&
    currentGame?.status !== 'ARCHIVED';

  useEffect(() => {
    const checkServerProblem = async () => {
      try {
        const hasServerProblem = await ResultsStorage.getServerProblem(game.id);
        const localResults = await ResultsStorage.getResults(game.id);
        if (hasServerProblem && localResults?.rounds && localResults.rounds.length > 0) {
          openModal({ type: 'syncConflict' });
        }
        setCanInitialize(true);
      } catch (error) {
        console.error('Failed to check server problem:', error);
        setCanInitialize(true);
      }
    };
    checkServerProblem();
  }, [game.id, openModal]);

  useEffect(() => {
    if (!engine.initialized) return;

    if (engine.initialized && !mountedRef.current) {
      setTimeout(() => {
        mountedRef.current = true;
      }, 300);
    }
  }, [engine.initialized]);

  useEffect(() => {
    if (game && engine.initialized) {
      const engineState = GameResultsEngine.getState();
      if (engineState.gameId === game.id) {
        if (shouldSyncEngineGameFromShell(game, engine.game)) {
          engine.updateGame(game);
        }
      }
    }
  }, [game, engine.initialized, engine.game, engine]);

  useEffect(() => {
    const matches = rounds.length > 0 ? rounds[0].matches || [] : [];
    const shouldAutoEdit =
      matches.length === 1 &&
      !editingMatchId &&
      canEdit &&
      isEditingResults &&
      matches[0].teamA.length === 0 &&
      matches[0].teamB.length === 0 &&
      !mountedRef.current;

    if (shouldAutoEdit) {
      engine.setEditingMatchId(matches[0].id);
    } else if (!(canEdit && isEditingResults)) {
      engine.setEditingMatchId(null);
    }
  }, [rounds, editingMatchId, canEdit, isEditingResults, engine]);

  const dragAndDrop = useDragAndDrop(canEdit && isEditingResults);

  const handleCreateAllCombinations = async () => {
    if (isCreatingAllCombinations || !showCreateAllCombinationsButton) return;

    setIsCreatingAllCombinations(true);
    try {
      await engine.createAllFivePlayerCombinations(players.map((player) => player.id));
      toast.success(t('gameResults.createAllCombinationsDone'));
    } catch (error: unknown) {
      console.error('Failed to create all combinations:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err?.response?.data?.message || err?.message || t('errors.generic'));
    } finally {
      setIsCreatingAllCombinations(false);
    }
  };

  const handlePlayerSelect = async (playerId: string) => {
    if (modal?.type !== 'player' || !(canEdit && isEditingResults)) return;

    const { matchTeam } = modal;
    const { roundId, matchId, team } = matchTeam;

    const actualRoundId =
      roundId ||
      (editingMatchId
        ? rounds.find((r) => r.matches.some((m) => m.id === editingMatchId))?.id
        : null) ||
      expandedRoundIds[0] ||
      (rounds.length > 0 ? rounds[0].id : null);
    if (!actualRoundId) return;
    const round = rounds.find((r) => r.id === actualRoundId);
    if (!round) return;

    const match = round.matches.find((m) => m.id === matchId);
    if (!match) return;

    const otherTeam = team === 'teamA' ? 'teamB' : 'teamA';
    const otherTeamPlayers = match[otherTeam];

    if (otherTeamPlayers.includes(playerId) || match[team].includes(playerId)) {
      return;
    }

    await engine.addPlayerToTeam(actualRoundId, matchId, team, playerId);
    closeModal();
  };

  const handleCourtSelect = async (courtId: string) => {
    if (modal?.type !== 'court') return;

    await engine.setMatchCourt(modal.match.roundId, modal.match.matchId, courtId);
    closeModal();
  };

  const effectiveShowCourts = (currentGame?.gameCourts?.length || 0) > 0;
  const isLandscape = useIsLandscape();
  const effectiveHorizontalLayout = !isLandscape;

  const { setGameDetailsCanShowTableView } = useGameDetailsChromeStore();
  const canShowTableView = canShowTournamentTableView(currentGame);

  useEffect(() => {
    setGameDetailsCanShowTableView(!!canShowTableView);
  }, [canShowTableView, setGameDetailsCanShowTableView]);

  const primaryRoundId = editingMatchId
    ? rounds.find((r) => r.matches.some((m) => m.id === editingMatchId))?.id ??
      expandedRoundIds[0] ??
      rounds[0]?.id
    : expandedRoundIds[0] ?? rounds[0]?.id;

  const sharedModals = (
    <GameResultsModals
      modal={modal}
      rounds={rounds}
      players={players}
      currentGame={currentGame}
      primaryRoundId={primaryRoundId}
      effectiveHorizontalLayout={effectiveHorizontalLayout}
      onClose={closeModal}
      onUpdateSetResult={setOps.updateSetResult}
      onRemoveSet={setOps.removeSet}
      onPlayerSelect={handlePlayerSelect}
      onCourtSelect={handleCourtSelect}
      onRestart={lifecycle.handleRestart}
      onFinish={lifecycle.handleFinish}
      onEdit={lifecycle.handleEdit}
      onSyncToServerFirst={lifecycle.handleSyncToServerFirst}
      onEraseAndLoadFromServer={lifecycle.handleEraseAndLoadFromServer}
      isResolvingConflict={loading.resolvingConflict}
    />
  );

  if (canInitialize === null) {
    return <ResultsLoadingState label={t('app.loading')} />;
  }

  if ((engineLoading || !engine.initialized) && canInitialize && modal?.type !== 'syncConflict' && user) {
    return <ResultsLoadingState label={t('app.loading')} />;
  }

  if (!canInitialize && modal?.type === 'syncConflict') {
    return (
      <>
        <ResultsLoadingState label={t('app.loading')} />
        {sharedModals}
      </>
    );
  }

  if (!currentGame && canInitialize) {
    return (
      <div className="flex min-h-[200px] items-center justify-center py-4">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">{t('errors.notFound')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {bracketReturnTarget ? <BracketReturnBar target={bracketReturnTarget} /> : null}
      <div className="w-full [&>div]:px-0 [&>div]:py-4">
        <OfflineBanner
          serverProblem={serverProblem}
          showMessage={showOfflineMessage}
          onToggle={toggleMessage}
          onSync={lifecycle.handleSyncToServer}
          isSyncing={loading.syncing}
        />
      </div>

      <ResultsTelegramSection currentGame={currentGame} telegram={telegram} />

      {currentGame?.resultsStatus === 'FINAL' ? (
        <div className="w-full">
          <GameResultsShareCard game={currentGame} />
          <GameResultsShowInStoriesSwitch game={game} onGameUpdate={onGameUpdate} />
        </div>
      ) : null}

      {isResultsEntryMode && (
        <GameResultsTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          resultsStatus={currentGame?.resultsStatus}
        />
      )}

      <div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={
              currentGame?.resultsStatus === 'FINAL' && activeTab === 'results'
                ? 'results'
                : currentGame && currentGame.resultsStatus !== 'NONE' && activeTab === 'stats'
                  ? 'stats'
                  : 'scores'
            }
            {...TAB_CONTENT_MOTION}
          >
            {currentGame?.resultsStatus === 'FINAL' && activeTab === 'results' ? (
              <div className="w-full">
                <PlayStreakResultsBanner
                  gameId={currentGame.id}
                  outcomes={currentGame.outcomes || []}
                />
                <div className="[&>div]:mx-0 [&>div]:max-w-none [&>div]:px-0">
                  <OutcomesDisplay
                    outcomes={currentGame.outcomes || []}
                    affectsRating={currentGame.affectsRating}
                    gameId={currentGame.id}
                    hasFixedTeams={currentGame.hasFixedTeams || false}
                    genderTeams={(currentGame.genderTeams || 'ANY') as 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS'}
                    winnerOfGame={currentGame.winnerOfGame}
                    onExplanationClick={(explanation, playerName, levelBefore) => {
                      openModal({
                        type: 'explanation',
                        explanation,
                        playerName,
                        levelBefore,
                        gameId: currentGame.id,
                        affectsRating: currentGame.affectsRating,
                      });
                    }}
                  />
                </div>
                {showWorkoutSummaryCard ? (
                  <div className="[&>div]:px-0 [&>div]:py-4">
                    <GameWorkoutSummaryCard gameId={currentGame.id} />
                  </div>
                ) : null}
              </div>
            ) : currentGame && currentGame.resultsStatus !== 'NONE' && activeTab === 'stats' ? (
              <PlayerStatsPanel game={currentGame as NonNullable<typeof currentGame>} rounds={rounds} />
            ) : (
              <ResultsRoundsBoard
                currentGame={currentGame}
                players={players}
                rounds={rounds}
                displayRounds={displayRounds}
                engine={engine}
                dragAndDrop={dragAndDrop}
                canEdit={canEdit}
                isEditingResults={isEditingResults}
                isSendingToTelegram={isSendingToTelegram}
                canEditResultsForRounds={canEditResultsForRounds}
                showCreateAllCombinationsButton={showCreateAllCombinationsButton}
                isCreatingAllCombinations={isCreatingAllCombinations}
                effectiveShowCourts={effectiveShowCourts}
                onCreateAllCombinations={() => void handleCreateAllCombinations()}
                openModal={openModal}
                onAddSupplementalSet={(roundId, matchId) => void setOps.addSupplementalSet(roundId, matchId)}
                onRoundAdded={onRoundAdded}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {sharedModals}
      </div>

      <ResultsFooterActions
        currentGame={currentGame}
        loading={loading}
        disabled={isSendingToTelegram}
        showFinishButton={Boolean(showFinishButton && !serverProblem)}
        showEditButton={Boolean(showEditButton)}
        showRestartButton={Boolean(canEdit && isResultsEntryMode && isEditingResults)}
        onFinishClick={() => openModal({ type: 'finish' })}
        onEditClick={() => openModal({ type: 'edit' })}
        onRestartClick={() => openModal({ type: 'restart' })}
      />
    </>
  );
};
