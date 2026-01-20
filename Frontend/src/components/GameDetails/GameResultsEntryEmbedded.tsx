import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { OutcomesDisplay } from '@/components';
import { gamesApi } from '@/api';
import { resultsApi } from '@/api/results';
import { BasicUser, Game } from '@/types';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useGameResultsEngine } from '@/hooks/useGameResultsEngine';
import { useModalManager } from '@/hooks/useModalManager';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useOfflineMessage } from '@/hooks/useOfflineMessage';
import { useGameResultsTabs } from '@/hooks/useGameResultsTabs';
import { GameResultsEngine, useGameResultsStore } from '@/services/gameResultsEngine';
import { validateSetIndex, validateSetScores, validateSetIndexAgainstFixed, isUserGameAdminOrOwner, isLastSet, validateTieBreak } from '@/utils/gameResults';
import { 
  RoundCard,
  AvailablePlayersFooter, 
  FloatingDraggedPlayer,
  PlayerStatsPanel,
} from '@/components/gameResults';
import { ResultsStorage } from '@/services/resultsStorage';
import { getRestartText, getFinishText, getAvailablePlayers, canEnterResults } from '@/utils/gameResultsHelpers';
import { GameResultsTabs } from './GameResultsTabs';
import { OfflineBanner } from './OfflineBanner';
import { GameResultsModals } from './GameResultsModals';
import { Send, Edit } from 'lucide-react';

interface GameResultsEntryEmbeddedProps {
  game: Game;
  onGameUpdate: (game: Game) => void;
}

export const GameResultsEntryEmbedded = ({ game, onGameUpdate }: GameResultsEntryEmbeddedProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [canInitialize, setCanInitialize] = useState<boolean | null>(null);
  
  const engine = useGameResultsEngine({
    gameId: canInitialize === true ? game.id : undefined,
    userId: canInitialize === true ? user?.id : undefined,
  });

  const { modal, openModal, closeModal } = useModalManager();
  const { loading, setLoadingState } = useLoadingState();
  const { showOfflineMessage, toggleMessage } = useOfflineMessage(engine.serverProblem);
  const mountedRef = useRef(false);
  const [isSendingToTelegram, setIsSendingToTelegram] = useState(false);
  const [hasInitiatedTelegramSend, setHasInitiatedTelegramSend] = useState(false);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const currentGame = useMemo(() => {
    if (!engine.game) return game;
    if (!game) return engine.game;
    if (game.resultsStatus !== engine.game.resultsStatus || game.status !== engine.game.status) {
      return game;
    }
    return engine.game;
  }, [engine.game, game]);

  const { activeTab, setActiveTab } = useGameResultsTabs(currentGame?.resultsStatus);

  const canEdit = engine.canEdit;
  const engineLoading = engine.loading;
  const expandedRoundId = engine.expandedRoundId;
  const editingMatchId = engine.editingMatchId;
  const serverProblem = engine.serverProblem;
  const rounds = engine.rounds;

  const players = useMemo(() => 
    (currentGame?.participants.filter(p => p.isPlaying).map(p => p.user) || []) as BasicUser[], 
    [currentGame?.participants]
  );

  const isPresetGame = players.length === 2 || players.length === 4;
  const isResultsEntryMode = currentGame?.resultsStatus !== 'NONE' || rounds.length > 0;
  const isFinalStatus = currentGame?.resultsStatus === 'FINAL';

  const isEditingResults = useMemo(() => {
    if (!engine.initialized) return false;
    const hasResults = currentGame?.resultsStatus !== 'NONE';
    return hasResults && !isFinalStatus && canEdit;
  }, [engine.initialized, currentGame?.resultsStatus, isFinalStatus, canEdit]);

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
    if (!rounds || rounds.length === 0) return false;
    return rounds.some(round =>
      round.matches && round.matches.some(match =>
        match.sets && match.sets.some(set =>
          set.teamA > 0 || set.teamB > 0
        )
      )
    );
  }, [rounds]);

  const showSendToTelegramButton = useMemo(() => {
    if (!currentGame || !hasResultsEntered) return false;
    if (currentGame.resultsSentToTelegram) return false;
    if (hasInitiatedTelegramSend) return false;
    if (!currentGame.city?.telegramGroupId) return false;
    if ((currentGame.photosCount || 0) === 0 && !currentGame.mainPhotoId) return false;
    return true;
  }, [currentGame, hasResultsEntered, hasInitiatedTelegramSend]);

  const showTelegramSendingHint = useMemo(() => {
    if (!currentGame) return false;
    if (currentGame.resultsSentToTelegram) return false;
    return hasInitiatedTelegramSend;
  }, [currentGame, hasInitiatedTelegramSend]);

  const handleSendToTelegram = () => {
    if (!currentGame || isSendingToTelegram || hasInitiatedTelegramSend) return;

    if (currentGame.resultsStatus !== 'FINAL') {
      toast.error(t('gameResults.sendToTelegramFailed') || 'Game must be finalized before sending results to Telegram');
      return;
    }

    setIsSendingToTelegram(true);
    
    gamesApi.sendResultsToTelegram(currentGame.id)
      .then(() => {
        setHasInitiatedTelegramSend(true);
      })
      .catch((error: any) => {
        console.error('Failed to send results to Telegram:', error);
        const errorMessage = error?.response?.data?.message || error?.message || t('gameResults.sendToTelegramFailed') || 'Failed to send results to Telegram';
        toast.error(errorMessage);
      })
      .finally(() => {
        setIsSendingToTelegram(false);
      });
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
        const engineGame = engine.game;
        if (!engineGame || 
            engineGame.resultsStatus !== game.resultsStatus ||
            engineGame.status !== game.status) {
          engine.updateGame(game);
        }
      }
    }
  }, [game, engine.initialized, engine.game, engine]);

  useEffect(() => {
    if (!currentGame) return;
    
    if (currentGame.resultsSentToTelegram) {
      setHasInitiatedTelegramSend(false);
    }
  }, [currentGame]);

  useEffect(() => {
    const matches = rounds.length > 0 ? rounds[0].matches || [] : [];
    const shouldAutoEdit = matches.length === 1 && !editingMatchId && !isPresetGame && 
      canEdit && isEditingResults && matches[0].teamA.length === 0 && 
      matches[0].teamB.length === 0 && !mountedRef.current;

    if (shouldAutoEdit) {
      engine.setEditingMatchId(matches[0].id);
    } else if (isPresetGame || !(canEdit && isEditingResults)) {
      engine.setEditingMatchId(null);
    }
  }, [rounds, editingMatchId, isPresetGame, canEdit, isEditingResults, engine]);

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
          if (isUserGameAdminOrOwner(updatedGame, user.id)) {
            canEditValue = true;
          } else if (updatedGame.resultsByAnyone) {
            const participant = updatedGame.participants?.find(p => p.userId === user.id);
            canEditValue = !!participant;
          } else {
            canEditValue = false;
          }
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
        await GameResultsEngine.initialize(game.id, user.id, t);
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
    const roundId = expandedRoundId || (rounds.length > 0 ? rounds[0].id : null);
    if (!roundId) return;
    await engine.addPlayerToTeam(roundId, matchId, team, draggedPlayer);
  };

  const updateSetResult = async (roundId: string, matchId: string, setIndex: number, teamAScore: number, teamBScore: number, isTieBreak?: boolean) => {
    const setIndexError = validateSetIndex(setIndex);
    if (setIndexError) {
      console.error(setIndexError, setIndex);
      toast.error(t('errors.invalidSetIndex') || 'Invalid set index');
      return;
    }

    const currentState = GameResultsEngine.getState();
    const currentGameState = currentState.game;
    const currentRounds = rounds;

    const scoreError = validateSetScores(teamAScore, teamBScore, currentGameState);
    if (scoreError) {
      console.error(scoreError);
      if (scoreError.includes('cannot exceed')) {
        const max = scoreError.match(/\d+/)?.[0];
        if (scoreError.includes('Total score')) {
          toast.error(t('errors.totalScoreExceedsMax', { max }) || scoreError);
        } else {
          toast.error(t('errors.scoreExceedsMax', { max }) || scoreError);
        }
      } else {
        toast.error(t('errors.invalidScores') || scoreError);
      }
      return;
    }

    try {
      const round = currentRounds.find(r => r.id === roundId);
      
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

      const fixedNumberOfSets = currentGameState?.fixedNumberOfSets || 0;
      
      const indexError = validateSetIndexAgainstFixed(setIndex, fixedNumberOfSets);
      if (indexError) {
        toast.error(t('errors.setIndexExceedsMax', { max: fixedNumberOfSets > 0 ? fixedNumberOfSets - 1 : 0 }) || indexError);
        return;
      }

      const newSets = [...match.sets];
      
      if (fixedNumberOfSets > 0) {
        while (newSets.length < fixedNumberOfSets && newSets.length <= setIndex) {
          newSets.push({ teamA: 0, teamB: 0, isTieBreak: false });
        }
        if (newSets.length > fixedNumberOfSets) {
          newSets.splice(fixedNumberOfSets);
        }
      } else {
        while (newSets.length <= setIndex) {
          newSets.push({ teamA: 0, teamB: 0, isTieBreak: false });
        }
      }
      
      const setBeingUpdated = { teamA: teamAScore, teamB: teamBScore, isTieBreak: isTieBreak || false };
      const lastSetCheck = isLastSet(setIndex, newSets, fixedNumberOfSets, setBeingUpdated);
      
      // Validate that tiebreak sets cannot have equal scores
      if (isTieBreak && teamAScore === teamBScore && (teamAScore > 0 || teamBScore > 0)) {
        toast.error('TieBreak sets cannot have equal scores');
        return;
      }
      
      const tieBreakError = validateTieBreak(
        setIndex,
        newSets,
        fixedNumberOfSets,
        isTieBreak || false,
        currentGameState?.ballsInGames || false,
        setBeingUpdated
      );

      if (tieBreakError) {
        console.error('TieBreak validation error:', tieBreakError);
        toast.error(tieBreakError);
        return;
      }
      
      const finalIsTieBreak = isTieBreak && lastSetCheck ? true : false;
      
      newSets[setIndex] = { teamA: teamAScore, teamB: teamBScore, isTieBreak: finalIsTieBreak };
      
      for (let i = 0; i < newSets.length; i++) {
        if (i !== setIndex && newSets[i].isTieBreak) {
          newSets[i] = { ...newSets[i], isTieBreak: false };
        }
      }
      
      if (fixedNumberOfSets === 0 && setIndex === newSets.length - 1 && (teamAScore > 0 || teamBScore > 0) && !finalIsTieBreak) {
        newSets.push({ teamA: 0, teamB: 0, isTieBreak: false });
      }
      
      await engine.updateMatch(roundId, matchId, {
        teamA: match.teamA,
        teamB: match.teamB,
        sets: newSets,
        courtId: match.courtId,
      });
    } catch (error: any) {
      console.error('Failed to update set result:', error);
      toast.error(error?.response?.data?.message || t('errors.generic') || 'Failed to update set result');
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

      const fixedNumberOfSets = currentGameState?.fixedNumberOfSets || 0;
      if (fixedNumberOfSets > 0) {
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
    try {
      if (serverProblem) {
        try {
          await engine.syncToServer();
        } catch (syncError: any) {
          console.error('Failed to sync to server:', syncError);
          toast.error(syncError?.response?.data?.message || t('errors.syncRequired') || 'Please sync to server before finishing');
          return;
        }
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
      closeModal();
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
        engine.setExpandedRoundId(null);
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
    
    const actualRoundId = roundId || expandedRoundId || (rounds.length > 0 ? rounds[0].id : null);
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
    if (!isPresetGame && !currentGame?.prohibitMatchesEditing && editingMatchId && canEdit && isEditingResults) {
      const target = e.target as HTMLElement;
      const isClickInsideMatch = target.closest('[data-match-container]');
      if (!isClickInsideMatch) {
        engine.setEditingMatchId(null);
      }
    }
  };

  const effectiveShowCourts = (currentGame?.gameCourts?.length || 0) > 0;
  const effectiveHorizontalLayout = currentGame?.fixedNumberOfSets === 1;

  if (canInitialize === null) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if ((engineLoading || !engine.initialized) && canInitialize && modal?.type !== 'syncConflict') {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if (!canInitialize && modal?.type === 'syncConflict') {
    return (
      <>
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">{t('app.loading')}</p>
          </div>
        </div>
        <GameResultsModals
          modal={modal}
          rounds={rounds}
          players={players}
          currentGame={currentGame}
          expandedRoundId={expandedRoundId}
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
      <div className="flex items-center justify-center min-h-[200px] p-4">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">{t('errors.notFound')}</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <OfflineBanner
        serverProblem={serverProblem}
        showMessage={showOfflineMessage}
        onToggle={toggleMessage}
        onSync={handleSyncToServer}
        isSyncing={loading.syncing}
      />

      {showSendToTelegramButton && (
        <div className="mb-6 flex justify-center px-4">
          <button
            onClick={handleSendToTelegram}
            disabled={isSendingToTelegram}
            className="group relative px-4 sm:px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 text-white font-semibold text-sm sm:text-base shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-600/40 transition-all duration-300 ease-in-out disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:shadow-lg disabled:hover:shadow-blue-500/30 flex items-center justify-center gap-2.5 transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            <Send size={18} className="transition-transform duration-300 group-hover:translate-x-0.5 flex-shrink-0" />
            <span className="text-center leading-tight whitespace-normal break-words max-w-[200px]">{t('gameResults.sendResultsToTelegram') || 'Send results to Telegram chat'}</span>
          </button>
        </div>
      )}

      {showTelegramSendingHint && (
        <div className="mb-6 flex justify-center px-4">
          <div className="px-4 sm:px-6 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-sm sm:text-base flex items-center gap-2.5 max-w-md">
            <div className="w-5 h-5 bg-blue-600 dark:bg-blue-400 rounded-full flex-shrink-0 animate-bounce" />
            <span className="text-center leading-tight">
              {t('gameResults.preparingTelegramMessage') || 'Wait for a while, we are preparing message for you. You can close this game.'}
            </span>
          </div>
        </div>
      )}

      {isResultsEntryMode && (
        <GameResultsTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          resultsStatus={currentGame?.resultsStatus}
        />
      )}

      <div>
        {currentGame?.resultsStatus === 'FINAL' && activeTab === 'results' ? (
          <div>
            <OutcomesDisplay 
              outcomes={currentGame.outcomes || []} 
              affectsRating={currentGame.affectsRating} 
              gameId={currentGame.id}
              hasFixedTeams={currentGame.hasFixedTeams || false}
              genderTeams={(currentGame.genderTeams || 'ANY') as 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS'}
              onExplanationClick={(explanation, playerName, levelBefore) => {
                openModal({ type: 'explanation', explanation, playerName, levelBefore });
              }}
            />
          </div>
        ) : currentGame && currentGame.resultsStatus !== 'NONE' && activeTab === 'stats' ? (
          <PlayerStatsPanel game={currentGame as NonNullable<typeof currentGame>} rounds={rounds} />
        ) : (
          <div 
            ref={resultsContainerRef}
            className={`space-y-1 w-full scrollbar-hide hover:scrollbar-thin hover:scrollbar-thumb-gray-300 dark:hover:scrollbar-thumb-gray-600 ${
              dragAndDrop.isDragging ? 'overflow-hidden' : ''
            } pb-4`}
            onDragOver={dragAndDrop.handleDragOver}
            onClick={handleContainerClick}
          >
            <div className="space-y-1 pt-0 pb-2">
              {rounds.map((round, index) => (
                <RoundCard
                  key={round.id}
                  round={round}
                  roundIndex={index}
                  players={players}
                  isPresetGame={isPresetGame}
                  isExpanded={expandedRoundId === round.id}
                  canEditResults={canEdit && isEditingResults && isResultsEntryMode}
                  editingMatchId={editingMatchId}
                  draggedPlayer={dragAndDrop.draggedPlayer}
                  showDeleteButton={rounds.length > 1 && canEdit && isEditingResults}
                  hideFrame={false}
                  onRemoveRound={() => engine.removeRound(round.id)}
                  onToggleExpand={() => {
                    if (expandedRoundId === round.id) {
                      engine.setExpandedRoundId(null);
                      engine.setEditingMatchId(null);
                    } else {
                      engine.setExpandedRoundId(round.id);
                    }
                  }}
                  onAddMatch={() => engine.addMatch(round.id)}
                  onRemoveMatch={(matchId) => engine.removeMatch(round.id, matchId)}
                  onMatchClick={(matchId) => {
                    if (!currentGame?.prohibitMatchesEditing && editingMatchId !== matchId) {
                      engine.setEditingMatchId(matchId);
                    }
                  }}
                  onSetClick={(matchId, setIndex) => openModal({ type: 'set', roundId: round.id, matchId, setIndex })}
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
                  prohibitMatchesEditing={currentGame?.prohibitMatchesEditing}
                />
              ))}
              
              {canEdit && isEditingResults && (
                <div className="flex justify-center">
                  <button
                    onClick={async () => {
                      await initializeRoundsIfNeeded();
                      await engine.addRound();
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors shadow-lg flex items-center gap-2"
                  >
                    <span>+</span>
                    {t('gameResults.addRound')}
                  </button>
                </div>
              )}

              {!isPresetGame && !currentGame?.prohibitMatchesEditing && editingMatchId && canEdit && isEditingResults && expandedRoundId && (() => {
                const expandedRound = rounds.find(r => r.id === expandedRoundId);
                const editingMatch = expandedRound?.matches.find(m => m.id === editingMatchId);
                const roundMatches = expandedRound?.matches || [];

                return (
                  <AvailablePlayersFooter
                    players={players}
                    editingMatch={editingMatch}
                    roundMatches={roundMatches}
                    draggedPlayer={dragAndDrop.draggedPlayer}
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

        <GameResultsModals
          modal={modal}
          rounds={rounds}
          players={players}
          currentGame={currentGame}
          expandedRoundId={expandedRoundId}
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
          <button
            onClick={() => openModal({ type: 'finish' })}
            disabled={loading.saving}
            className="px-8 py-3 text-base rounded-lg font-medium transition-colors bg-green-500 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading.saving ? t('common.loading') : getFinishText(currentGame, t)}
          </button>
        </div>
      )}
      {showEditButton && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => openModal({ type: 'edit' })}
            disabled={loading.editing}
            className="px-8 py-3 text-base rounded-lg font-medium transition-colors bg-blue-500 hover:bg-blue-600 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading.editing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span>{t('common.loading')}</span>
              </>
            ) : (
              <>
                <Edit size={18} className="flex-shrink-0" />
                <span>{t('gameResults.editResults')}</span>
              </>
            )}
          </button>
        </div>
      )}
      {canEdit && isResultsEntryMode && isEditingResults && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            onClick={() => openModal({ type: 'restart' })}
            disabled={loading.restarting}
            className="px-4 py-2 text-sm rounded-lg font-medium transition-colors bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading.restarting ? t('common.loading') : getRestartText(currentGame, t)}
          </button>
        </div>
      )}
    </>
  );
};
