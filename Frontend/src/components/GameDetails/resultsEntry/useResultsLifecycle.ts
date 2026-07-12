import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { gamesApi } from '@/api';
import { resultsApi } from '@/api/results';
import { Game } from '@/types';
import { GameResultsEngine, useGameResultsStore } from '@/services/gameResultsEngine';
import { ResultsStorage } from '@/services/resultsStorage';
import { canUserEditResults } from '@/utils/gameResults';
import type { LoadingState } from '@/hooks/useLoadingState';
import type { TabType } from '@/hooks/useGameResultsTabs';

interface UseResultsLifecycleParams {
  game: Game;
  user: { id: string; isAdmin?: boolean } | null;
  engine: {
    syncToServer: () => Promise<unknown>;
    resetGame: () => Promise<unknown>;
    updateGame: (game: Game) => void;
    setEditingMatchId: (matchId: string | null) => void;
  };
  setLoadingState: (updates: Partial<LoadingState>) => void;
  closeModal: () => void;
  onGameUpdate: (game: Game) => void;
  setActiveTab: (tab: TabType) => void;
  setCanInitialize: (value: boolean) => void;
}

export function useResultsLifecycle({
  game,
  user,
  engine,
  setLoadingState,
  closeModal,
  onGameUpdate,
  setActiveTab,
  setCanInitialize,
}: UseResultsLifecycleParams) {
  const { t } = useTranslation();

  const handleFinish = useCallback(async () => {
    setLoadingState({ saving: true });
    let syncFailed = false;
    try {
      try {
        await engine.syncToServer();
      } catch (syncError: unknown) {
        syncFailed = true;
        console.error('Failed to sync to server:', syncError);
        const err = syncError as { response?: { data?: { message?: string } } };
        toast.error(
          err?.response?.data?.message ||
            t('errors.syncRequired') ||
            'Please sync to server before finishing'
        );
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
    } catch (error: unknown) {
      console.error('Failed to save results:', error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || t('errors.generic'));
    } finally {
      setLoadingState({ saving: false });
      if (!syncFailed) closeModal();
    }
  }, [engine, game.id, onGameUpdate, setLoadingState, closeModal, t]);

  const handleRestart = useCallback(async () => {
    if (!user?.id) return;

    setLoadingState({ restarting: true });
    try {
      await engine.resetGame();

      const response = await gamesApi.getById(game.id);
      if (response?.data) {
        const updatedGame = response.data;
        engine.updateGame(updatedGame);
        onGameUpdate(updatedGame);
        closeModal();
        setActiveTab('scores');
        engine.setEditingMatchId(null);
      }
      toast.success(t('common.restarted') || 'Game restarted successfully');
    } catch (error: unknown) {
      console.error('Failed to restart game:', error);
      const err = error as { response?: { data?: { message?: string }; status?: number }; message?: string };
      const errorMessage = err?.response?.data?.message || err?.message || t('errors.generic');
      toast.error(errorMessage);

      if (err?.response?.status === 409) {
        setTimeout(async () => {
          const response = await gamesApi.getById(game.id);
          if (response?.data) onGameUpdate(response.data);
        }, 2000);
      }
    } finally {
      setLoadingState({ restarting: false });
      closeModal();
    }
  }, [user?.id, engine, game.id, onGameUpdate, setLoadingState, closeModal, setActiveTab, t]);

  const handleEdit = useCallback(async () => {
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
    } catch (error: unknown) {
      console.error('Failed to edit results:', error);
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err?.response?.data?.message || err?.message || t('errors.generic'));
    } finally {
      setLoadingState({ editing: false });
      closeModal();
    }
  }, [user?.id, engine, game.id, onGameUpdate, setLoadingState, closeModal, t]);

  const handleSyncToServer = useCallback(async () => {
    setLoadingState({ syncing: true });
    try {
      await engine.syncToServer();
      toast.success(t('common.synced') || 'Results synced to server successfully');
      const response = await gamesApi.getById(game.id);
      if (response?.data) {
        onGameUpdate(response.data);
      }
    } catch (error: unknown) {
      console.error('Failed to sync to server:', error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(
        err?.response?.data?.message || t('errors.generic') || 'Failed to sync to server'
      );
    } finally {
      setLoadingState({ syncing: false });
    }
  }, [engine, game.id, onGameUpdate, setLoadingState, t]);

  const handleSyncToServerFirst = useCallback(async () => {
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
    } catch (error: unknown) {
      console.error('Failed to sync to server:', error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(
        err?.response?.data?.message || t('errors.generic') || 'Failed to sync to server'
      );
      setCanInitialize(true);
    } finally {
      setLoadingState({ resolvingConflict: false });
    }
  }, [user, game.id, onGameUpdate, setLoadingState, closeModal, setCanInitialize, t]);

  const handleEraseAndLoadFromServer = useCallback(async () => {
    if (!user?.id) return;

    setLoadingState({ resolvingConflict: true });
    try {
      await ResultsStorage.deleteResults(game.id);
      await ResultsStorage.setServerProblem(game.id, false);
      closeModal();
      setCanInitialize(true);
    } catch (error: unknown) {
      console.error('Failed to erase local changes:', error);
      toast.error(t('errors.generic') || 'Failed to erase local changes');
    } finally {
      setLoadingState({ resolvingConflict: false });
    }
  }, [user?.id, game.id, setLoadingState, closeModal, setCanInitialize, t]);

  return {
    handleFinish,
    handleRestart,
    handleEdit,
    handleSyncToServer,
    handleSyncToServerFirst,
    handleEraseAndLoadFromServer,
  };
}
