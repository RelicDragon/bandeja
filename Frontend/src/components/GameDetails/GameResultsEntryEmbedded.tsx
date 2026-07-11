import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { OutcomesDisplay } from '@/components';
import { gamesApi } from '@/api';
import { resultsApi } from '@/api/results';
import { BasicUser, Game } from '@/types';
import type { Round } from '@/types/gameResults';
import { shouldShowRoundAddedModal } from '@/utils/fivePlayerMatchCombinations';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useGameResultsEngine } from '@/hooks/useGameResultsEngine';
import { useModalManager } from '@/hooks/useModalManager';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useOfflineMessage } from '@/hooks/useOfflineMessage';
import { useGameResultsTabs } from '@/hooks/useGameResultsTabs';
import { GameResultsEngine, useGameResultsStore } from '@/services/gameResultsEngine';
import { validateSetIndex, canUserEditResults, canShowTournamentTableView } from '@/utils/gameResults';
import {
  getRules,
  isLegalSetScore,
  validationMessage,
  shouldAppendSetAfterUpdate,
  trimTrailingEmptyAfterDecision,
  getStandingsMatchOutcome,
  isClassicRules,
  isClassicAutomaticRelaxedScores,
  automaticSetEntryUsesTieBreak,
  mergeAutomaticMatchRecordMetadata,
  type AutomaticMatchRecordMode,
  isResultsMatchFinished,
  isResultsMatchInProgressForResultsHeader,
  matchSetsHaveAnyNonZeroScore,
} from '@/utils/scoring';
import { isSupplementalMatchSet, type MatchSetRole } from '@/utils/matchSetRole';
import { ScoringRulebookBanner } from '@/components/gameResults/scoring';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { userIsPlayingInGameOrParent } from '@/utils/gameParticipationState';
import {
  resolveCurrentGameForResults,
  shouldSyncEngineGameFromShell,
} from '@/utils/mergeGameFormatForResults';
import { 
  RoundCard,
  AvailablePlayersFooter, 
  FloatingDraggedPlayer,
  PlayerStatsPanel,
} from '@/components/gameResults';
import { ResultsStorage } from '@/services/resultsStorage';
import {
  getRestartText,
  getFinishText,
  getAvailablePlayers,
  canEnterResults,
  isPresetResultsRoster,
} from '@/utils/gameResultsHelpers';
import { motion, AnimatePresence } from 'framer-motion';
import { GameResultsTabs } from './GameResultsTabs';
import { OfflineBanner } from './OfflineBanner';
import { GameResultsModals } from './GameResultsModals';
import { GameWorkoutSummaryCard } from './GameWorkoutSummaryCard';
import { TelegramSummaryModal } from './TelegramSummaryModal';
import { ConfirmationModal } from '@/components';
import { Edit, Plus, Sparkles, RotateCcw, CheckCircle2, Send } from 'lucide-react';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import {
  canAccessResultsTelegramActions,
  getGameOwnerIsPremium,
  getPhotoGenerationsMax,
  hasCachedResultsSummary,
  hasEnteredResultsForTelegram,
  hasGamePhotoForTelegram,
  isAnyArtifactGenerating,
  mergeGameResultsArtifactsFields,
} from '@/utils/gameResultsArtifacts.util';
import { canManageGamePhotos } from '@shared/gamePhotos/permissions';
import { ResultsArtifactsTelegramBlock } from './ResultsArtifactsTelegramBlock';
import { GameResultsShareCard } from './GameResultsShareCard';
import { useGamePhotosStore } from '@/store/gamePhotosStore';
import {
  buildGameBracketReturnPath,
  resolveGameBracketReturnTarget,
} from '@/utils/gameBracketReturn.util';
import { canCreateAllFivePlayerCombinations } from '@/utils/fivePlayerMatchCombinations';
import { Trophy } from 'lucide-react';

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

const ResultsLoadingState = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center min-h-[200px]">
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center"
    >
      <div className="relative inline-flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary-400/20" />
        <span className="absolute inset-0 rounded-full border-2 border-primary-200 dark:border-primary-900" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary-500" />
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary-500" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
    </motion.div>
  </div>
);

export const GameResultsEntryEmbedded = ({ game, onGameUpdate, onRoundAdded }: GameResultsEntryEmbeddedProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [canInitialize, setCanInitialize] = useState<boolean | null>(null);
  
  const engine = useGameResultsEngine({
    gameId: canInitialize === true ? game.id : undefined,
    userId: canInitialize === true ? (user?.id || '') : undefined,
  });

  const { modal, openModal, closeModal } = useModalManager();
  const { loading, setLoadingState } = useLoadingState();
  const { showOfflineMessage, toggleMessage } = useOfflineMessage(engine.serverProblem);
  const mountedRef = useRef(false);
  const [isSendingToTelegram, setIsSendingToTelegram] = useState(false);
  const [isStartingArtifactGeneration, setIsStartingArtifactGeneration] = useState(false);
  const artifactGenerationInFlightRef = useRef(false);
  const wasArtifactGeneratingRef = useRef(false);
  const lastGamePhotoAdded = useSocketEventsStore((s) => s.lastGamePhotoAdded);
  const lastGameUpdate = useSocketEventsStore((s) => s.lastGameUpdate);
  const [isTelegramSummaryModalOpen, setIsTelegramSummaryModalOpen] = useState(false);
  const [telegramSummary, setTelegramSummary] = useState('');
  const [showResendTelegramConfirm, setShowResendTelegramConfirm] = useState(false);
  const [showNoPhotosTelegramConfirm, setShowNoPhotosTelegramConfirm] = useState(false);
  const [isResettingTelegram, setIsResettingTelegram] = useState(false);
  const [isCreatingAllCombinations, setIsCreatingAllCombinations] = useState(false);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const currentGame = useMemo(
    () => resolveCurrentGameForResults(game, engine.game),
    [engine.game, game]
  );

  const currentGameRef = useRef(currentGame);
  currentGameRef.current = currentGame;

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

  const players = useMemo(() => 
    (currentGame?.participants?.filter(isParticipantPlaying).map((p) => p.user) ?? []) as BasicUser[],
    [currentGame?.participants]
  );

  const showWorkoutSummaryCard = useMemo(
    () => userIsPlayingInGameOrParent(currentGame, user?.id),
    [currentGame, user?.id]
  );

  const isPresetGame = isPresetResultsRoster(players.length);
  const isResultsEntryMode = currentGame?.resultsStatus !== 'NONE' || rounds.length > 0;
  const isFinalStatus = currentGame?.resultsStatus === 'FINAL';

  const isEditingResults = useMemo(() => {
    if (!engine.initialized) return false;
    const hasResults = currentGame?.resultsStatus !== 'NONE';
    return hasResults && !isFinalStatus && canEdit;
  }, [engine.initialized, currentGame?.resultsStatus, isFinalStatus, canEdit]);

  const showCreateAllCombinationsButton = useMemo(
    () =>
      canEdit &&
      isEditingResults &&
      !isSendingToTelegram &&
      canCreateAllFivePlayerCombinations(
        players.length,
        Boolean(currentGame?.hasFixedTeams),
        rounds,
      ),
    [
      canEdit,
      isEditingResults,
      isSendingToTelegram,
      players.length,
      currentGame?.hasFixedTeams,
      rounds,
    ],
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
    return rounds.some(round => 
      round.matches.some(match => 
        match.teamA.length > 0 && match.teamB.length > 0
      )
    );
  }, [rounds]);

  const showFinishButton = canEdit && isEditingResults && isResultsEntryMode && 
    rounds.length > 0 && rounds.some(r => r.matches.length > 0) && hasMatchesWithTeamsReady;
  const showEditButton = canEdit && !isEditingResults && isFinalStatus && 
    isResultsEntryMode && currentGame?.status !== 'ARCHIVED';

  const hasResultsEntered = useMemo(() => {
    if (currentGame && hasEnteredResultsForTelegram(currentGame)) return true;
    if (!rounds || rounds.length === 0) return false;
    return rounds.some((round) =>
      round.matches?.some((match) =>
        match.sets?.some((set) => set.teamA > 0 || set.teamB > 0)
      )
    );
  }, [currentGame, rounds]);

  const canUseResultsTelegram = useMemo(
    () => canAccessResultsTelegramActions(currentGame, user),
    [currentGame, user]
  );

  const canManagePhotos = useMemo(
    () => (currentGame && user ? canManageGamePhotos(currentGame, { id: user.id, isAdmin: user.isAdmin }) : false),
    [currentGame, user]
  );

  const hasPhotosForTelegramPost = useMemo(
    () => (currentGame ? hasGamePhotoForTelegram(currentGame) : false),
    [currentGame]
  );

  const hasCachedSummary = useMemo(
    () => hasCachedResultsSummary(currentGame?.resultsSummaryText),
    [currentGame?.resultsSummaryText]
  );

  const isArtifactsGenerating = useMemo(
    () =>
      isAnyArtifactGenerating(currentGame?.resultsArtifacts, {
        hasSummaryText: hasCachedSummary,
        hasGamePhoto: hasPhotosForTelegramPost,
      }),
    [currentGame?.resultsArtifacts, hasCachedSummary, hasPhotosForTelegramPost]
  );

  const showSendToTelegramButton = useMemo(() => {
    if (!currentGame || !hasResultsEntered || !canUseResultsTelegram) return false;
    if (currentGame.resultsSentToTelegram) return false;
    return true;
  }, [currentGame, hasResultsEntered, canUseResultsTelegram]);

  const photoGenerationsMaxFallback = useMemo(
    () => getPhotoGenerationsMax(getGameOwnerIsPremium(currentGame)),
    [currentGame]
  );

  const applyArtifactsPollPayload = useCallback(
    (
      artifacts: NonNullable<Game['resultsArtifacts']>,
      summaryText?: string | null,
      photoFields?: { photosCount?: number; mainPhotoId?: string | null }
    ) => {
      const game = currentGameRef.current;
      if (!game) return;
      onGameUpdate(
        mergeGameResultsArtifactsFields(game, {
          ...game,
          resultsArtifacts: artifacts,
          ...(summaryText !== undefined ? { resultsSummaryText: summaryText } : {}),
          ...(photoFields?.photosCount !== undefined
            ? { photosCount: photoFields.photosCount }
            : {}),
          ...(photoFields?.mainPhotoId !== undefined
            ? { mainPhotoId: photoFields.mainPhotoId }
            : {}),
        })
      );
    },
    [onGameUpdate]
  );

  const applyArtifactsStatusPayload = useCallback(
    (payload: {
      artifacts: NonNullable<Game['resultsArtifacts']>;
      resultsSummaryText?: string | null;
    }) => {
      applyArtifactsPollPayload(payload.artifacts, payload.resultsSummaryText);
    },
    [applyArtifactsPollPayload]
  );

  const startArtifactGeneration = async (
    request: (gameId: string) => ReturnType<typeof gamesApi.prepareResultsArtifactPhoto>
  ) => {
    if (
      !currentGame ||
      artifactGenerationInFlightRef.current ||
      isStartingArtifactGeneration ||
      isArtifactsGenerating
    ) {
      return;
    }

    artifactGenerationInFlightRef.current = true;
    setIsStartingArtifactGeneration(true);
    try {
      const response = await request(currentGame.id);
      const payload = response.data;
      if (payload?.resultsArtifacts) {
        applyArtifactsPollPayload(payload.resultsArtifacts, payload.resultsSummaryText, {
          photosCount: payload.photosCount,
          mainPhotoId: payload.mainPhotoId,
        });
      }
      try {
        const status = await gamesApi.getResultsArtifactsStatus(currentGame.id);
        if (status.data) {
          applyArtifactsStatusPayload(status.data);
        }
      } catch {
        // follow-up poll will retry
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        t('gameResults.prepareResultsFailed');
      toast.error(errorMessage);
    } finally {
      artifactGenerationInFlightRef.current = false;
      setIsStartingArtifactGeneration(false);
    }
  };

  const handleGenerateResultsPhoto = () => void startArtifactGeneration(gamesApi.prepareResultsArtifactPhoto);

  const loadGamePhotos = useGamePhotosStore((s) => s.loadGamePhotos);

  const refreshGamePhotosFromServer = useCallback(
    async (gameId: string) => {
      await loadGamePhotos(gameId).catch(() => {});
      try {
        const response = await gamesApi.getById(gameId);
        const game = currentGameRef.current;
        if (response.data && game?.id === gameId) {
          onGameUpdate(mergeGameResultsArtifactsFields(game, response.data));
        }
      } catch {
        // ignore refresh errors
      }
    },
    [loadGamePhotos, onGameUpdate]
  );

  useEffect(() => {
    if (!currentGame?.id || currentGame.resultsStatus !== 'FINAL') return;
    void loadGamePhotos(currentGame.id).catch(() => {});
  }, [currentGame?.id, currentGame?.resultsStatus, loadGamePhotos]);

  useEffect(() => {
    if (!currentGame?.id || !lastGamePhotoAdded || lastGamePhotoAdded.gameId !== currentGame.id) {
      return;
    }
    void refreshGamePhotosFromServer(currentGame.id);
  }, [currentGame?.id, lastGamePhotoAdded, refreshGamePhotosFromServer]);

  useEffect(() => {
    if (!currentGame?.id || !lastGameUpdate || lastGameUpdate.gameId !== currentGame.id) return;
    const updated = lastGameUpdate.game;
    const prev = currentGameRef.current;
    if (!prev) return;
    const photosChanged =
      (updated.photosCount ?? 0) !== (prev.photosCount ?? 0) ||
      updated.mainPhotoId !== prev.mainPhotoId ||
      (updated.mainPhoto?.id ?? null) !== (prev.mainPhoto?.id ?? null);
    if (photosChanged) {
      void refreshGamePhotosFromServer(currentGame.id);
    }
  }, [currentGame?.id, lastGameUpdate, refreshGamePhotosFromServer]);

  useEffect(() => {
    const shouldPoll = isArtifactsGenerating || isStartingArtifactGeneration;
    if (!currentGame?.id || !shouldPoll) return;

    const gameId = currentGame.id;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await gamesApi.getResultsArtifactsStatus(gameId);
        if (cancelled || !response.data) return;
        applyArtifactsStatusPayload(response.data);

        const stillGenerating = isAnyArtifactGenerating(response.data.artifacts, {
          hasSummaryText: hasCachedResultsSummary(response.data.resultsSummaryText),
        });
        if (wasArtifactGeneratingRef.current && !stillGenerating) {
          void refreshGamePhotosFromServer(gameId);
        }
        wasArtifactGeneratingRef.current = stillGenerating;
      } catch {
        // ignore polling errors
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    currentGame?.id,
    isArtifactsGenerating,
    isStartingArtifactGeneration,
    applyArtifactsStatusPayload,
    refreshGamePhotosFromServer,
  ]);

  const showSentToTelegramHint = useMemo(() => {
    if (!currentGame || !hasResultsEntered || !canUseResultsTelegram) return false;
    if (!currentGame.resultsSentToTelegram) return false;
    return true;
  }, [currentGame, hasResultsEntered, canUseResultsTelegram]);

  const handleSendToTelegram = () => {
    if (!currentGame || isSendingToTelegram) return;
    if (currentGame.resultsStatus !== 'FINAL') {
      toast.error(t('gameResults.sendToTelegramFailed') || 'Game must be finalized before sending results to Telegram');
      return;
    }
    if (!hasPhotosForTelegramPost) {
      setShowNoPhotosTelegramConfirm(true);
      return;
    }
    void openTelegramSummaryModal();
  };

  const handleConfirmNoPhotosTelegram = () => {
    setShowNoPhotosTelegramConfirm(false);
    void openTelegramSummaryModal();
  };

  const handleSendSummaryToTelegram = async (summaryText: string) => {
    if (!currentGame) return;

    await gamesApi.sendResultsToTelegram(currentGame.id, summaryText);
    setIsTelegramSummaryModalOpen(false);
    
    onGameUpdate({
      ...currentGame,
      resultsSentToTelegram: true,
    });
  };

  const openTelegramSummaryModal = async () => {
    if (!currentGame || isSendingToTelegram || isArtifactsGenerating || isStartingArtifactGeneration) {
      return;
    }

    const cachedSummary = currentGame.resultsSummaryText?.trim();
    if (cachedSummary) {
      setTelegramSummary(cachedSummary);
      setIsTelegramSummaryModalOpen(true);
      return;
    }

    setIsSendingToTelegram(true);
    try {
      const response = await gamesApi.prepareTelegramSummary(currentGame.id);
      if (response.data?.summary) {
        setTelegramSummary(response.data.summary);
        setIsTelegramSummaryModalOpen(true);
      } else {
        throw new Error('No summary received');
      }
    } catch (error: any) {
      console.error('Failed to prepare Telegram summary:', error);
      const errorMessage = error?.response?.data?.message || error?.message ||
        t('gameResults.prepareTextFailed') || 'Failed to prepare text';
      toast.error(errorMessage);
    } finally {
      setIsSendingToTelegram(false);
    }
  };

  const handleResendToTelegramConfirm = async () => {
    if (!currentGame) return;
    setIsResettingTelegram(true);
    try {
      await gamesApi.resetTelegramResultsSent(currentGame.id);
      const updated = { ...currentGame, resultsSentToTelegram: false };
      onGameUpdate(updated);
      setShowResendTelegramConfirm(false);
      const hasPhotos = (updated.photosCount || 0) > 0 || !!updated.mainPhotoId;
      if (!hasPhotos) {
        setShowNoPhotosTelegramConfirm(true);
      } else {
        await openTelegramSummaryModal();
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || t('errors.generic');
      toast.error(errorMessage);
    } finally {
      setIsResettingTelegram(false);
    }
  };

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
      setTimeout(() => { mountedRef.current = true; }, 300);
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

  const handleSyncToServerFirst = async () => {
    if (!user?.id) return;
    
    setLoadingState({ resolvingConflict: true });
    try {
      const localResults = await ResultsStorage.getResults(game.id);
      if (localResults?.rounds && localResults.rounds.length > 0) {
        const gameResponse = await gamesApi.getById(game.id);
        if (!gameResponse?.data) {
          throw new Error('Game not found');
        }

        const updatedGame = gameResponse.data;
        const state = GameResultsEngine.getState();
        
        let canEditValue = state.canEdit;
        if (!canEditValue) {
          canEditValue = canUserEditResults(updatedGame, user);
        }
        
        const gameState = state.gameState || {
          type: 'NO_RESULTS',
          message: 'games.results.positive.noResultsYet',
          canEdit: canEditValue,
          showInputs: false,
          showClock: false,
        };
        
        useGameResultsStore.setState({
          gameId: game.id,
          userId: user.id,
          game: updatedGame,
          rounds: localResults.rounds,
          canEdit: canEditValue,
          gameState,
          initialized: true,
          loading: false,
        });

        await GameResultsEngine.syncToServer();
        await ResultsStorage.setServerProblem(game.id, false);
        await GameResultsEngine.initialize(game.id, user.id, t, { isAdmin: user.isAdmin });
        closeModal();
        setCanInitialize(true);
        onGameUpdate(updatedGame);
      } else {
        await ResultsStorage.setServerProblem(game.id, false);
        closeModal();
        setCanInitialize(true);
      }
    } catch (error: any) {
      console.error('Failed to sync to server:', error);
      toast.error(error?.response?.data?.message || t('errors.generic') || 'Failed to sync to server');
      setCanInitialize(true);
    } finally {
      setLoadingState({ resolvingConflict: false });
    }
  };

  const handleEraseAndLoadFromServer = async () => {
    if (!user?.id) return;
    
    setLoadingState({ resolvingConflict: true });
    try {
      await ResultsStorage.deleteResults(game.id);
      await ResultsStorage.setServerProblem(game.id, false);
      closeModal();
      setCanInitialize(true);
    } catch (error: any) {
      console.error('Failed to erase local changes:', error);
      toast.error(t('errors.generic') || 'Failed to erase local changes');
    } finally {
      setLoadingState({ resolvingConflict: false });
    }
  };

  const handleMatchDrop = async (matchId: string, team: 'teamA' | 'teamB', draggedPlayer: string) => {
    const roundId = rounds.find(r => r.matches.some(m => m.id === matchId))?.id ?? (rounds.length > 0 ? rounds[0].id : null);
    if (!roundId) return;
    await engine.addPlayerToTeam(roundId, matchId, team, draggedPlayer);
  };

  const updateSetResult = async (
    roundId: string,
    matchId: string,
    setIndex: number,
    teamAScore: number,
    teamBScore: number,
    isTieBreak?: boolean,
    supplementalRole?: Extract<MatchSetRole, 'EXTRA_GAMES' | 'EXTRA_BALLS'>,
    options?: { automaticRecordMode?: AutomaticMatchRecordMode },
  ) => {
    const setIndexError = validateSetIndex(setIndex);
    if (setIndexError) {
      console.error(setIndexError, setIndex);
      toast.error(t('errors.invalidSetIndex') || 'Invalid set index');
      return;
    }

    const currentState = GameResultsEngine.getState();
    const currentGameState = currentState.game;
    const rules = getRules(currentGameState);

    try {
      const round = rounds.find(r => r.id === roundId);
      if (!round) {
        console.error('Round not found:', roundId);
        toast.error(t('errors.roundNotFound') || 'Round not found');
        return;
      }

      const match = round.matches.find(m => m.id === matchId);
      if (!match) {
        console.error('Match not found:', matchId, 'in round:', roundId);
        toast.error(t('errors.matchNotFound') || 'Match not found');
        return;
      }

      const existingAt = match.sets[setIndex];
      if (supplementalRole || (existingAt && isSupplementalMatchSet(existingAt))) {
        const role = supplementalRole ?? existingAt?.role ?? 'EXTRA_GAMES';
        const workingSets = [...match.sets];
        workingSets[setIndex] = {
          ...workingSets[setIndex],
          teamA: teamAScore,
          teamB: teamBScore,
          isTieBreak: false,
          role,
        };
        await engine.updateMatch(roundId, matchId, {
          teamA: match.teamA,
          teamB: match.teamB,
          sets: workingSets,
          courtId: match.courtId,
        });
        return;
      }

      const workingSets = [...match.sets];
      const cap = rules.fixedNumberOfSets > 0 ? rules.fixedNumberOfSets : 99;
      while (workingSets.length <= setIndex && workingSets.length < cap) {
        workingSets.push({ teamA: 0, teamB: 0, isTieBreak: false, role: 'OFFICIAL' });
      }
      if (setIndex >= workingSets.length) {
        toast.error(t('errors.setIndexExceedsMax', { max: workingSets.length - 1 }) || 'Invalid set index');
        return;
      }

      const validation = isLegalSetScore(teamAScore, teamBScore, rules, setIndex, workingSets, isTieBreak);
      if (!validation.ok && validation.reason && !isClassicAutomaticRelaxedScores(rules)) {
        toast.error(validationMessage(t, validation.reason, validation.detail));
        return;
      }

      const kind = isClassicAutomaticRelaxedScores(rules)
        ? (automaticSetEntryUsesTieBreak(setIndex, workingSets, rules, Boolean(isTieBreak))
            ? 'SUPER_TIEBREAK'
            : 'REGULAR')
        : validation.kind;
      const finalIsTieBreak = kind === 'TIEBREAK_GAME' || kind === 'SUPER_TIEBREAK';

      workingSets[setIndex] = {
        ...workingSets[setIndex],
        teamA: teamAScore,
        teamB: teamBScore,
        isTieBreak: finalIsTieBreak,
        role: workingSets[setIndex].role ?? 'OFFICIAL',
      };

      const metadata =
        options?.automaticRecordMode != null
          ? mergeAutomaticMatchRecordMetadata(match.metadata, options.automaticRecordMode)
          : match.metadata;

      if (isClassicRules(rules) && rules.superTieBreakReplacesDeciderAtIndex === null) {
        for (let i = 0; i < workingSets.length; i++) {
          if (i !== setIndex && workingSets[i].isTieBreak) {
            workingSets[i] = { ...workingSets[i], isTieBreak: false };
          }
        }
      }

      let nextSets = workingSets;
      const appended = shouldAppendSetAfterUpdate(workingSets, rules);
      if (appended) {
        nextSets = [...workingSets, appended];
      }

      const outcome = getStandingsMatchOutcome(nextSets, rules);
      if (outcome !== null) {
        nextSets = trimTrailingEmptyAfterDecision(nextSets, rules);
      }

      await engine.updateMatch(roundId, matchId, {
        teamA: match.teamA,
        teamB: match.teamB,
        sets: nextSets,
        courtId: match.courtId,
        metadata,
      });
    } catch (error: any) {
      console.error('Failed to update set result:', error);
      toast.error(error?.response?.data?.message || t('errors.generic') || 'Failed to update set result');
    }
  };

  const addSupplementalSet = async (roundId: string, matchId: string) => {
    const round = rounds.find((r) => r.id === roundId);
    const match = round?.matches.find((m) => m.id === matchId);
    if (!round || !match) return;
    const next = [
      ...match.sets,
      { teamA: 0, teamB: 0, isTieBreak: false, role: 'EXTRA_GAMES' as const },
    ];
    try {
      await engine.updateMatch(roundId, matchId, {
        teamA: match.teamA,
        teamB: match.teamB,
        sets: next,
        courtId: match.courtId,
      });
      openModal({ type: 'set', roundId, matchId, setIndex: next.length - 1 });
    } catch (error: any) {
      toast.error(error?.response?.data?.message || t('errors.generic'));
    }
  };

  const removeSet = async (roundId: string, matchId: string, setIndex: number) => {
    const setIndexError = validateSetIndex(setIndex);
    if (setIndexError) {
      console.error(setIndexError, setIndex);
      toast.error(t('errors.invalidSetIndex') || 'Invalid set index');
      return;
    }

    try {
      const currentState = GameResultsEngine.getState();
      const currentGameState = currentState.game;
      const round = rounds.find(r => r.id === roundId);
      
      if (!round) {
        console.error('Round not found:', roundId);
        toast.error(t('errors.roundNotFound') || 'Round not found');
        return;
      }

      const match = round.matches.find(m => m.id === matchId);
      if (!match) {
        console.error('Match not found:', matchId, 'in round:', roundId);
        toast.error(t('errors.matchNotFound') || 'Match not found');
        return;
      }

      const rules = getRules(currentGameState);
      const removingSupplemental = isSupplementalMatchSet(match.sets[setIndex]);
      if (rules.fixedNumberOfSets > 0 && !rules.allowRemoveSet && !removingSupplemental) {
        toast.error(t('errors.cannotRemoveLastSet') || 'Cannot remove sets when fixed number of sets is set');
        return;
      }

      if (match.sets.length <= 1) {
        toast.error(t('errors.cannotRemoveLastSet') || 'Cannot remove the last set');
        return;
      }

      if (setIndex >= match.sets.length) {
        console.error('Set index out of bounds:', setIndex, 'sets length:', match.sets.length);
        toast.error(t('errors.invalidSetIndex') || 'Invalid set index');
        return;
      }
      
      const newSets = [...match.sets];
      newSets.splice(setIndex, 1);
      
      await engine.updateMatch(roundId, matchId, {
        teamA: match.teamA,
        teamB: match.teamB,
        sets: newSets,
        courtId: match.courtId,
      });
    } catch (error: any) {
      console.error('Failed to remove set:', error);
      toast.error(error?.response?.data?.message || t('errors.generic') || 'Failed to remove set');
    }
  };

  const dragAndDrop = useDragAndDrop(canEdit && isEditingResults);

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

  const handleTouchEndWrapper = (e: TouchEvent) => {
    dragAndDrop.handleTouchEnd(e, handleMatchDrop);
  };

  const handleCreateAllCombinations = async () => {
    if (isCreatingAllCombinations || !showCreateAllCombinationsButton) return;

    setIsCreatingAllCombinations(true);
    try {
      await engine.createAllFivePlayerCombinations(players.map((player) => player.id));
      toast.success(t('gameResults.createAllCombinationsDone'));
    } catch (error: any) {
      console.error('Failed to create all combinations:', error);
      toast.error(error?.response?.data?.message || error?.message || t('errors.generic'));
    } finally {
      setIsCreatingAllCombinations(false);
    }
  };

  const initializeRoundsIfNeeded = async () => {
    const shouldInitialize = engine.initialized && rounds.length === 0 && canEdit && 
      currentGame?.resultsStatus !== 'NONE' && currentGame?.resultsStatus !== 'FINAL';
    
    if (shouldInitialize) {
      if (rounds.length === 0) {
        if (isPresetGame) {
          await engine.initializePresetMatches();
        } else {
          await engine.initializeDefaultRound();
        }
      }
    }
  };

  const handleFinish = async () => {
    setLoadingState({ saving: true });
    let syncFailed = false;
    try {
      try {
        await engine.syncToServer();
      } catch (syncError: any) {
        syncFailed = true;
        console.error('Failed to sync to server:', syncError);
        toast.error(syncError?.response?.data?.message || t('errors.syncRequired') || 'Please sync to server before finishing');
        return;
      }

      await resultsApi.recalculateOutcomes(game.id);
      toast.success(t('common.saved') || 'Results saved successfully');
      const response = await gamesApi.getById(game.id);
      if (response?.data) {
        const updatedGame = response.data;
        engine.updateGame(updatedGame);
        GameResultsEngine.updateGame(updatedGame);
        onGameUpdate({ ...updatedGame });
      }
    } catch (error: any) {
      console.error('Failed to save results:', error);
      toast.error(error?.response?.data?.message || t('errors.generic'));
    } finally {
      setLoadingState({ saving: false });
      if (!syncFailed) closeModal();
    }
  };

  const handleRestart = async () => {
    if (!user?.id) return;
    
    setLoadingState({ restarting: true });
    try {
      await engine.resetGame();
      
      const response = await gamesApi.getById(game.id);
      if (response?.data) {
        const updatedGame = response.data;
        console.log(`Response data status: ${updatedGame.resultsStatus}`);
        engine.updateGame(updatedGame);
        onGameUpdate(updatedGame);
        closeModal();
        setActiveTab('scores');
        engine.setEditingMatchId(null);
      }
      toast.success(t('common.restarted') || 'Game restarted successfully');
    } catch (error: any) {
      console.error('Failed to restart game:', error);
      const errorMessage = error?.response?.data?.message || error?.message || t('errors.generic');
      
      if (error?.response?.status === 409) {
        toast.error(errorMessage);
        setTimeout(async () => {
          const response = await gamesApi.getById(game.id);
          if (response?.data) onGameUpdate(response.data);
        }, 2000);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoadingState({ restarting: false });
      closeModal();
    }
  };

  const handleEdit = async () => {
    if (!user?.id) return;
    
    setLoadingState({ editing: true });
    try {
      await resultsApi.editGameResults(game.id);
      
      const response = await gamesApi.getById(game.id);
      if (response?.data) {
        const updatedGame = response.data;
        engine.updateGame(updatedGame);
        onGameUpdate(updatedGame);
      }
      toast.success(t('common.saved') || 'Results ready for editing');
    } catch (error: any) {
      console.error('Failed to edit results:', error);
      const errorMessage = error?.response?.data?.message || error?.message || t('errors.generic');
      toast.error(errorMessage);
    } finally {
      setLoadingState({ editing: false });
      closeModal();
    }
  };

  const handlePlayerSelect = async (playerId: string) => {
    if (modal?.type !== 'player' || !(canEdit && isEditingResults)) return;

    const { matchTeam } = modal;
    const { roundId, matchId, team } = matchTeam;
    
    const actualRoundId = roundId || (editingMatchId ? rounds.find(r => r.matches.some(m => m.id === editingMatchId))?.id : null) || expandedRoundIds[0] || (rounds.length > 0 ? rounds[0].id : null);
    if (!actualRoundId) return;
    const round = rounds.find(r => r.id === actualRoundId);
    if (!round) return;
    
    const match = round.matches.find(m => m.id === matchId);
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

  const handleCourtClick = (roundId: string, matchId: string) => {
    openModal({ type: 'court', match: { roundId, matchId } });
  };


  const handleSyncToServer = async () => {
    setLoadingState({ syncing: true });
    try {
      await engine.syncToServer();
      toast.success(t('common.synced') || 'Results synced to server successfully');
      const response = await gamesApi.getById(game.id);
      if (response?.data) {
        onGameUpdate(response.data);
      }
    } catch (error: any) {
      console.error('Failed to sync to server:', error);
      toast.error(error?.response?.data?.message || t('errors.generic') || 'Failed to sync to server');
    } finally {
      setLoadingState({ syncing: false });
    }
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

  const effectiveShowCourts = (currentGame?.gameCourts?.length || 0) > 0;
  const isLandscape = useIsLandscape();
  const effectiveHorizontalLayout = !isLandscape;

  const { setGameDetailsCanShowTableView } = useGameDetailsChromeStore();
  const canShowTableView = canShowTournamentTableView(currentGame);

  useEffect(() => {
    setGameDetailsCanShowTableView(!!canShowTableView);
  }, [canShowTableView, setGameDetailsCanShowTableView]);

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
        <GameResultsModals
          modal={modal}
          rounds={rounds}
          players={players}
          currentGame={currentGame}
          primaryRoundId={editingMatchId ? rounds.find(r => r.matches.some(m => m.id === editingMatchId))?.id ?? expandedRoundIds[0] ?? rounds[0]?.id : (expandedRoundIds[0] ?? rounds[0]?.id)}
          effectiveHorizontalLayout={effectiveHorizontalLayout}
          onClose={closeModal}
          onUpdateSetResult={updateSetResult}
          onRemoveSet={removeSet}
          onPlayerSelect={handlePlayerSelect}
          onCourtSelect={handleCourtSelect}
          onRestart={handleRestart}
          onFinish={handleFinish}
          onEdit={handleEdit}
          onSyncToServerFirst={handleSyncToServerFirst}
          onEraseAndLoadFromServer={handleEraseAndLoadFromServer}
          isResolvingConflict={loading.resolvingConflict}
        />
      </>
    );
  }

  if (!currentGame && canInitialize) {
    return (
      <div className="flex items-center justify-center min-h-[200px] py-4">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">{t('errors.notFound')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {bracketReturnTarget ? (
        <div className="mb-4 flex justify-center">
          <motion.button
            type="button"
            onClick={() => navigate(buildGameBracketReturnPath(bracketReturnTarget))}
            whileTap={{ scale: 0.97 }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100 hover:shadow-md dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-950/60"
          >
            <Trophy className="h-4 w-4 shrink-0" aria-hidden />
            {t('gameDetails.returnToBracket')}
          </motion.button>
        </div>
      ) : null}
      <div className="w-full [&>div]:px-0 [&>div]:py-4">
        <OfflineBanner
          serverProblem={serverProblem}
          showMessage={showOfflineMessage}
          onToggle={toggleMessage}
          onSync={handleSyncToServer}
          isSyncing={loading.syncing}
        />
      </div>

      {showSendToTelegramButton && (
        <ResultsArtifactsTelegramBlock
          artifacts={currentGame?.resultsArtifacts}
          hasSummaryText={hasCachedSummary}
          hasGamePhoto={hasPhotosForTelegramPost}
          isSending={isSendingToTelegram}
          isStartingGeneration={isStartingArtifactGeneration}
          photoGenerationsMaxFallback={photoGenerationsMaxFallback}
          canManagePhotos={canManagePhotos}
          onSend={handleSendToTelegram}
          onGeneratePhoto={handleGenerateResultsPhoto}
        />
      )}

      {showSentToTelegramHint && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col items-center gap-3"
        >
          <p className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 text-center">
            <Send size={14} className="shrink-0 text-sky-500" aria-hidden />
            {t('gameResults.resultsAlreadySentToTelegram') || 'Results already sent to Telegram'}
          </p>
          <motion.button
            type="button"
            onClick={() => setShowResendTelegramConfirm(true)}
            disabled={isResettingTelegram}
            whileTap={isResettingTelegram ? undefined : { scale: 0.97 }}
            className="min-w-[200px] rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-red-500/25 transition-all hover:from-red-600 hover:to-rose-700 hover:shadow-lg hover:shadow-red-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6 sm:text-base"
          >
            {isResettingTelegram ? t('common.loading') : (t('gameResults.resendResultsToTelegram') || 'Resend to Telegram')}
          </motion.button>
        </motion.div>
      )}

      <ConfirmationModal
        isOpen={showResendTelegramConfirm}
        title={t('gameResults.resendResultsToTelegram') || 'Resend to Telegram'}
        message={t('gameResults.resendResultsToTelegramConfirm') || 'Reset the sent state and open the summary to send again to the Telegram chat?'}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        isLoading={isResettingTelegram}
        loadingText={t('common.loading')}
        onConfirm={handleResendToTelegramConfirm}
        onClose={() => setShowResendTelegramConfirm(false)}
      />

      <ConfirmationModal
        isOpen={showNoPhotosTelegramConfirm}
        title={t('gameResults.sendWithoutPhotosTitle')}
        message={t('gameResults.sendWithoutPhotosMessage')}
        confirmText={t('gameResults.sendWithoutPhotosConfirm')}
        cancelText={t('common.cancel')}
        tone="info"
        confirmVariant="primary"
        onConfirm={handleConfirmNoPhotosTelegram}
        onClose={() => setShowNoPhotosTelegramConfirm(false)}
      />

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
            <GameResultsShareCard game={currentGame} />
            <div className="[&>div]:mx-0 [&>div]:max-w-none [&>div]:px-0">
              <OutcomesDisplay
                outcomes={currentGame.outcomes || []}
                affectsRating={currentGame.affectsRating}
                gameId={currentGame.id}
                hasFixedTeams={currentGame.hasFixedTeams || false}
                genderTeams={(currentGame.genderTeams || 'ANY') as 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS'}
                winnerOfGame={currentGame.winnerOfGame}
                onExplanationClick={(explanation, playerName, levelBefore) => {
                  openModal({ type: 'explanation', explanation, playerName, levelBefore });
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
          <div 
            ref={resultsContainerRef}
            className={`space-y-1 w-full scrollbar-hide hover:scrollbar-thin hover:scrollbar-thumb-gray-300 dark:hover:scrollbar-thumb-gray-600 ${
              dragAndDrop.isDragging ? 'overflow-hidden' : ''
            } ${isSendingToTelegram ? 'pointer-events-none opacity-60' : ''} pb-4 transition-opacity duration-300`}
            onDragOver={dragAndDrop.handleDragOver}
            onClick={handleContainerClick}
          >
            <div className="space-y-1 pt-0 pb-2">
              {canEdit && isEditingResults && !isSendingToTelegram && currentGame?.scoringPreset && (
                <ScoringRulebookBanner game={currentGame} />
              )}
              {showCreateAllCombinationsButton && (
                <div className="flex justify-center pb-2">
                  <motion.button
                    type="button"
                    onClick={() => void handleCreateAllCombinations()}
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
                      const roundHasEditingMatch = round.matches.some(m => m.id === editingMatchId);
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
                  onSetClick={(matchId, setIndex) => openModal({ type: 'set', roundId: round.id, matchId, setIndex })}
                  onAddSupplementalSet={(matchId) => addSupplementalSet(round.id, matchId)}
                  onRemovePlayer={(matchId, team, playerId) => engine.removePlayerFromTeam(round.id, matchId, team, playerId)}
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
                    const match = round.matches.find(m => m.id === matchId);
                    return match ? canEnterResults(match) : false;
                  }}
                  showCourtLabel={effectiveShowCourts}
                  courts={currentGame?.gameCourts?.map(gc => gc.court) || []}
                  onCourtClick={(matchId) => handleCourtClick(round.id, matchId)}
                  fixedNumberOfSets={currentGame?.fixedNumberOfSets}
                  game={currentGame}
                  gameId={currentGame?.id}
                  onMatchTimerTransition={(rId, mId, action) => engine.transitionMatchTimer(rId, mId, action)}
                />
              ))}
              
              {canEdit && isEditingResults && !isSendingToTelegram && (
                <div className="flex justify-center">
                  <motion.button
                    onClick={async () => {
                      await initializeRoundsIfNeeded();
                      await engine.addRound();
                      const rounds = useGameResultsStore.getState().rounds;
                      const newRound = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;
                      if (newRound && shouldShowRoundAddedModal(newRound)) onRoundAdded?.(newRound);
                    }}
                    whileTap={{ scale: 0.97 }}
                    className="group inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 px-5 py-2.5 font-medium text-blue-600 transition-all hover:border-blue-400 hover:bg-blue-100/70 hover:text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:border-blue-600 dark:hover:bg-blue-950/50 dark:hover:text-blue-200"
                  >
                    <Plus size={18} className="shrink-0 transition-transform duration-300 group-hover:rotate-90" aria-hidden />
                    {t('gameResults.addRound')}
                  </motion.button>
                </div>
              )}

              {editingMatchId && canEdit && isEditingResults && !isSendingToTelegram && (() => {
                const expandedRound = rounds.find(r => r.matches.some(m => m.id === editingMatchId));
                const editingMatch = expandedRound?.matches.find(m => m.id === editingMatchId);
                if (!expandedRound || !editingMatch) return null;
                const roundMatches = expandedRound.matches;

                return (
                  <AvailablePlayersFooter
                    players={players}
                    editingMatch={editingMatch}
                    roundMatches={roundMatches}
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
          </div>
        )}
        </motion.div>
        </AnimatePresence>

        <GameResultsModals
          modal={modal}
          rounds={rounds}
          players={players}
          currentGame={currentGame}
          primaryRoundId={editingMatchId ? rounds.find(r => r.matches.some(m => m.id === editingMatchId))?.id ?? expandedRoundIds[0] ?? rounds[0]?.id : (expandedRoundIds[0] ?? rounds[0]?.id)}
          effectiveHorizontalLayout={effectiveHorizontalLayout}
          onClose={closeModal}
          onUpdateSetResult={updateSetResult}
          onRemoveSet={removeSet}
          onPlayerSelect={handlePlayerSelect}
          onCourtSelect={handleCourtSelect}
          onRestart={handleRestart}
          onFinish={handleFinish}
          onEdit={handleEdit}
          onSyncToServerFirst={handleSyncToServerFirst}
          onEraseAndLoadFromServer={handleEraseAndLoadFromServer}
          isResolvingConflict={loading.resolvingConflict}
        />

        {dragAndDrop.draggedPlayer && dragAndDrop.dragPosition && (
          <FloatingDraggedPlayer
            player={players.find(p => p.id === dragAndDrop.draggedPlayer) || null}
            position={dragAndDrop.dragPosition}
          />
        )}
      </div>

      {showFinishButton && !serverProblem && (
        <div className="flex justify-center pt-2">
          <motion.button
            onClick={() => openModal({ type: 'finish' })}
            disabled={loading.saving || isSendingToTelegram}
            whileTap={loading.saving || isSendingToTelegram ? undefined : { scale: 0.97 }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-600 hover:to-green-700 hover:shadow-xl hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading.saving ? (
              <>
                <div className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>{t('common.loading')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={20} className="flex-shrink-0" aria-hidden />
                <span>{getFinishText(currentGame, t)}</span>
              </>
            )}
          </motion.button>
        </div>
      )}
      {showEditButton && (
        <div className="flex justify-center pt-2">
          <motion.button
            onClick={() => openModal({ type: 'edit' })}
            disabled={loading.editing || isSendingToTelegram}
            whileTap={loading.editing || isSendingToTelegram ? undefined : { scale: 0.97 }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-sky-600 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-sky-700 hover:shadow-xl hover:shadow-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading.editing ? (
              <>
                <div className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>{t('common.loading')}</span>
              </>
            ) : (
              <>
                <Edit size={18} className="flex-shrink-0" aria-hidden />
                <span>{t('gameResults.editResults')}</span>
              </>
            )}
          </motion.button>
        </div>
      )}
      {canEdit && isResultsEntryMode && isEditingResults && (
        <div className="flex justify-center gap-2 pt-2">
          <motion.button
            onClick={() => openModal({ type: 'restart' })}
            disabled={loading.restarting || isSendingToTelegram}
            whileTap={loading.restarting || isSendingToTelegram ? undefined : { scale: 0.97 }}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            <RotateCcw size={15} className="shrink-0" aria-hidden />
            {loading.restarting ? t('common.loading') : getRestartText(currentGame, t)}
          </motion.button>
        </div>
      )}

      <TelegramSummaryModal
        isOpen={isTelegramSummaryModalOpen}
        onClose={() => setIsTelegramSummaryModalOpen(false)}
        gameId={currentGame?.id || ''}
        initialSummary={telegramSummary}
        onSend={handleSendSummaryToTelegram}
      />
    </>
  );
};
