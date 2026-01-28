import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GameResultsEngine, useGameResultsStore } from '@/services/gameResultsEngine';
import { socketService } from '@/services/socketService';
import { useSocketEventsStore } from '@/store/socketEventsStore';

interface UseGameResultsEngineProps {
  gameId: string | undefined;
  userId: string | undefined;
}

export function useGameResultsEngine({ gameId, userId }: UseGameResultsEngineProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const game = useGameResultsStore((state) => state.game);
  const rounds = useGameResultsStore((state) => state.rounds);
  const loading = useGameResultsStore((state) => state.loading);
  const initialized = useGameResultsStore((state) => state.initialized);
  const canEdit = useGameResultsStore((state) => state.canEdit);
  const gameState = useGameResultsStore((state) => state.gameState);
  const expandedRoundId = useGameResultsStore((state) => state.expandedRoundId);
  const editingMatchId = useGameResultsStore((state) => state.editingMatchId);
  const syncStatus = useGameResultsStore((state) => state.syncStatus);
  const serverProblem = useGameResultsStore((state) => state.serverProblem);

  const lastGameResultsUpdated = useSocketEventsStore((state) => state.lastGameResultsUpdated);

  useEffect(() => {
    if (!gameId) return;
    
    const currentGameId = gameId;
    const currentUserId = userId || '';
    
    const state = GameResultsEngine.getState();
    const needsInit = !state.initialized || state.gameId !== gameId || state.userId !== currentUserId;
    
    if (needsInit) {
      GameResultsEngine.initialize(gameId, currentUserId, t).catch((err) => {
        if (err?.response?.status !== 401) {
          console.error('Failed to initialize GameResultsEngine:', err);
          setError(err.message || 'Failed to initialize');
        }
      });
    }

    console.log(`[GameResultsEngine] Connected to results stream for game ${gameId}`);

    return () => {
      console.log(`[GameResultsEngine] Disconnecting from results stream for game ${gameId}`);
      const state = GameResultsEngine.getState();
      if (state.initialized && state.gameId === currentGameId && state.userId === currentUserId) {
        GameResultsEngine.cleanup();
      }
    };
  }, [gameId, userId, t]);

  useEffect(() => {
    if (!lastGameResultsUpdated || lastGameResultsUpdated.gameId !== gameId) return;
    console.log(`[GameResultsEngine] Received results-updated notification for game ${gameId}`);
    GameResultsEngine.initialize(gameId, userId || '', t).catch((err) => {
      console.error('Failed to reload results:', err);
    });
  }, [lastGameResultsUpdated, gameId, userId, t]);

  const addRound = useCallback(() => GameResultsEngine.addRound(), []);
  const removeRound = useCallback((roundId: string) => GameResultsEngine.removeRound(roundId, t), [t]);
  const addMatch = useCallback((roundId: string, matchId?: string) => GameResultsEngine.addMatch(roundId, matchId), []);
  const removeMatch = useCallback((roundId: string, matchId: string) => GameResultsEngine.removeMatch(roundId, matchId), []);
  const addPlayerToTeam = useCallback((roundId: string, matchId: string, team: 'teamA' | 'teamB', playerId: string) =>
    GameResultsEngine.addPlayerToTeam(roundId, matchId, team, playerId), []);
  const removePlayerFromTeam = useCallback((roundId: string, matchId: string, team: 'teamA' | 'teamB', playerId: string) =>
    GameResultsEngine.removePlayerFromTeam(roundId, matchId, team, playerId), []);
  const updateMatch = useCallback((roundId: string, matchId: string, match: { teamA: string[]; teamB: string[]; sets: Array<{ teamA: number; teamB: number }>; courtId?: string }) =>
    GameResultsEngine.updateMatch(roundId, matchId, match), []);
  const setMatchCourt = useCallback((roundId: string, matchId: string, courtId: string) =>
    GameResultsEngine.setMatchCourt(roundId, matchId, courtId), []);
  const setExpandedRoundId = useCallback((roundId: string | null) => GameResultsEngine.setExpandedRoundId(roundId), []);
  const setEditingMatchId = useCallback((matchId: string | null) => GameResultsEngine.setEditingMatchId(matchId), []);
  const syncToServer = useCallback(() => GameResultsEngine.syncToServer(), []);
  const getGameResults = useCallback(() => GameResultsEngine.getGameResults(), []);
  const initializePresetMatches = useCallback(() => GameResultsEngine.initializePresetMatches(), []);
  const initializeDefaultRound = useCallback(() => GameResultsEngine.initializeDefaultRound(), []);
  const resetGame = useCallback(() => GameResultsEngine.resetGame(), []);
  const updateGame = useCallback((game: any) => GameResultsEngine.updateGame(game), []);

  return useMemo(() => ({
    game,
    rounds,
    loading,
    initialized,
    canEdit,
    gameState,
    expandedRoundId,
    editingMatchId,
    syncStatus,
    serverProblem,
    error,
    addRound,
    removeRound,
    addMatch,
    removeMatch,
    addPlayerToTeam,
    removePlayerFromTeam,
    updateMatch,
    setMatchCourt,
    setExpandedRoundId,
    setEditingMatchId,
    syncToServer,
    getGameResults,
    initializePresetMatches,
    initializeDefaultRound,
    resetGame,
    updateGame,
  }), [
    game,
    rounds,
    loading,
    initialized,
    canEdit,
    gameState,
    expandedRoundId,
    editingMatchId,
    syncStatus,
    serverProblem,
    error,
    addRound,
    removeRound,
    addMatch,
    removeMatch,
    addPlayerToTeam,
    removePlayerFromTeam,
    updateMatch,
    setMatchCourt,
    setExpandedRoundId,
    setEditingMatchId,
    syncToServer,
    getGameResults,
    initializePresetMatches,
    initializeDefaultRound,
    resetGame,
    updateGame,
  ]);
}

