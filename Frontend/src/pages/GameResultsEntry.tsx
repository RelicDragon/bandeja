import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus } from 'lucide-react';
import { SetResultModal } from '@/components/SetResultModal';
import { CourtModal } from '@/components/CourtModal';
import { TeamPlayerSelector, ConfirmationModal, SyncStatusIcon, GameSetupModal, OutcomesDisplay } from '@/components';
import { gamesApi } from '@/api';
import { resultsApi } from '@/api/results';
import { User, WinnerOfGame, WinnerOfMatch } from '@/types';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useGameResultsEngine } from '@/hooks/useGameResultsEngine';
import { GameResultsEngine } from '@/services/gameResultsEngine';
import { 
  GameStatusDisplay, 
  MatchCard,
  HorizontalMatchCard,
  HorizontalScoreEntryModal,
  RoundCard,
  AvailablePlayersFooter, 
  FloatingDraggedPlayer,
  ConflictResolutionModal,
  PlayerStatsPanel
} from '@/components/gameResults';

export const GameResultsEntry = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  
  const engine = useGameResultsEngine({
    gameId: id,
    userId: user?.id,
  });

  const [showSetModal, setShowSetModal] = useState<{ roundId?: string; matchId: string; setIndex: number } | null>(null);
  const [showPlayerSelector, setShowPlayerSelector] = useState(false);
  const [selectedMatchTeam, setSelectedMatchTeam] = useState<{ roundId?: string; matchId: string; team: 'teamA' | 'teamB' } | null>(null);
  const [showCourtModal, setShowCourtModal] = useState(false);
  const [selectedCourtMatch, setSelectedCourtMatch] = useState<{ roundId: string; matchId: string } | null>(null);
  const [showRestartConfirmation, setShowRestartConfirmation] = useState(false);
  const [showFinishConfirmation, setShowFinishConfirmation] = useState(false);
  const [showEditConfirmation, setShowEditConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isResultsEntryMode, setIsResultsEntryMode] = useState(false);
  const [isEditingResults, setIsEditingResults] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'scores' | 'results' | 'stats'>('scores');
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  const game = engine.game;
  const rounds = engine.rounds;
  const canEdit = engine.canEdit;
  const gameState = engine.gameState;
  const loading = engine.loading;
  const expandedRoundId = engine.expandedRoundId;
  const editingMatchId = engine.editingMatchId;
  const hasChanges = engine.pendingOpsCount > 0;
  const syncStatus = engine.syncStatus;

  const players = useMemo(() => (game?.participants.map(p => p.user) || []) as User[], [game?.participants]);

  const needsGameSetup = game?.resultsStatus === 'NONE';

  const hasMultiRounds = game?.hasMultiRounds || false;
  const effectiveShowCourts = (game?.gameCourts?.length || 0) > 0;
  const effectiveHorizontalLayout = game?.fixedNumberOfSets === 1;

  const matches = useMemo(() => 
    Array.isArray(rounds) && rounds.length > 0
      ? rounds[0].matches || []
      : []
  , [rounds]);
  
  const isPresetGame = players.length === 2 || players.length === 4;

  const canEnterResults = (match: { teamA: string[]; teamB: string[] }) => {
    return match.teamA.length > 0 && match.teamB.length > 0;
  };

  const hasMatchesWithTeamsReady = useMemo(() => {
    if (rounds.length === 0) return false;
    return rounds.some(round => 
      round.matches.some(match => 
        match.teamA.length > 0 && match.teamB.length > 0
      )
    );
  }, [rounds]);

  const effectiveCanEdit = canEdit && isEditingResults;
  const isFinalStatus = game?.resultsStatus === 'FINAL';
  const showFinishButton = canEdit && isEditingResults && isResultsEntryMode && rounds.length > 0 && rounds.some(r => r.matches.length > 0) && hasMatchesWithTeamsReady;
  const showEditButton = canEdit && !isEditingResults && isFinalStatus && isResultsEntryMode && game?.status !== 'ARCHIVED';
  const finishButtonPanelHeight = (showFinishButton || showEditButton) ? 80 : 0;

  const handleMatchDrop = async (matchId: string, team: 'teamA' | 'teamB', draggedPlayer: string) => {
    const roundId = hasMultiRounds && expandedRoundId ? expandedRoundId : 'round-1';
    await engine.addPlayerToTeam(roundId, matchId, team, draggedPlayer);
  };

  const updateSetResult = async (matchId: string, setIndex: number, teamAScore: number, teamBScore: number) => {
    const roundId = hasMultiRounds && expandedRoundId ? expandedRoundId : 'round-1';
    const round = rounds.find(r => r.id === roundId);
    const match = round?.matches.find(m => m.id === matchId);
    
    if (!match) return;
    
    const fixedNumberOfSets = game?.fixedNumberOfSets || 0;
    const newSets = [...match.sets];
    
    while (newSets.length <= setIndex) {
      newSets.push({ teamA: 0, teamB: 0 });
    }
    
    newSets[setIndex] = { teamA: teamAScore, teamB: teamBScore };
    
    if (fixedNumberOfSets === 0 && setIndex === newSets.length - 1 && (teamAScore > 0 || teamBScore > 0)) {
      newSets.push({ teamA: 0, teamB: 0 });
    }
    
    await engine.updateMatch(roundId, matchId, {
      teamA: match.teamA,
      teamB: match.teamB,
      sets: newSets,
      courtId: match.courtId,
    });
  };

  const removeSet = async (matchId: string, setIndex: number) => {
    const roundId = hasMultiRounds && expandedRoundId ? expandedRoundId : 'round-1';
    const round = rounds.find(r => r.id === roundId);
    const match = round?.matches.find(m => m.id === matchId);
    
    if (!match || match.sets.length <= 1) return;
    
    const newSets = [...match.sets];
    newSets.splice(setIndex, 1);
    
    await engine.updateMatch(roundId, matchId, {
      teamA: match.teamA,
      teamB: match.teamB,
      sets: newSets,
      courtId: match.courtId,
    });
  };

  const addMatch = async () => {
    console.log('addMatch', hasMultiRounds, expandedRoundId);
    const roundId = hasMultiRounds && expandedRoundId ? expandedRoundId : 'round-1';
    await engine.addMatch(roundId);
  };

  const removeMatch = async (matchId: string) => {
    const roundId = hasMultiRounds && expandedRoundId ? expandedRoundId : 'round-1';
    await engine.removeMatch(roundId, matchId);
  };

  const removePlayerFromTeam = async (matchId: string, team: 'teamA' | 'teamB', playerId: string) => {
    const roundId = hasMultiRounds && expandedRoundId ? expandedRoundId : 'round-1';
    await engine.removePlayerFromTeam(roundId, matchId, team, playerId);
  };

  const dragAndDrop = useDragAndDrop(effectiveCanEdit);

  const handleDrop = (e: React.DragEvent | null, matchId: string, team: 'teamA' | 'teamB') => {
    if (e) e.preventDefault();
    if (!dragAndDrop.draggedPlayer) return;
    handleMatchDrop(matchId, team, dragAndDrop.draggedPlayer);
    dragAndDrop.handleDragEnd();
  };

  const handleTouchEndWrapper = (e: TouchEvent) => {
    dragAndDrop.handleTouchEnd(e, handleMatchDrop);
  };


  useEffect(() => {
    if (matches.length === 1 && !editingMatchId 
      && !isPresetGame 
      && effectiveCanEdit 
      && matches[0].teamA.length === 0 
      && matches[0].teamB.length === 0 && !mounted) {
      engine.setEditingMatchId(matches[0].id);
    }
  }, [matches, editingMatchId, isPresetGame, effectiveCanEdit, mounted, engine]);

  useEffect(() => {
    if (isPresetGame || !effectiveCanEdit) {
      engine.setEditingMatchId(null);
    }
  }, [isPresetGame, effectiveCanEdit, engine]);


  useEffect(() => {
    if (engine.initialized && !mounted) {
      setTimeout(() => setMounted(true), 300);
    }
  }, [engine.initialized, mounted]);

  useEffect(() => {
    if (engine.initialized && rounds.length > 0 && !isResultsEntryMode) {
      const hasResultsOrPendingOps = game?.resultsStatus !== 'NONE' || hasChanges;
      if (hasResultsOrPendingOps) {
        setIsResultsEntryMode(true);
        // Auto-enable editing for non-FINAL statuses
        if (game?.resultsStatus !== 'FINAL') {
          setIsEditingResults(true);
        }
      }
    }
  }, [engine.initialized, rounds.length, isResultsEntryMode, game?.resultsStatus, hasChanges]);

  useEffect(() => {
    const handleConflicts = (detectedConflicts: any[]) => {
      setConflicts(detectedConflicts);
      setShowConflictModal(true);
    };

    GameResultsEngine.setConflictCallback(handleConflicts);

    return () => {
      GameResultsEngine.setConflictCallback(null);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'results' && game?.resultsStatus !== 'FINAL') {
      setActiveTab('scores');
    }
  }, [game?.resultsStatus, activeTab]);

  const handleFinish = async () => {
    if (!id) return;
    
    setIsSaving(true);
    try {
      await engine.forceSync();

      if (engine.pendingOpsCount === 0) {
        await resultsApi.recalculateOutcomes(id);
        toast.success(t('common.saved') || 'Results saved successfully');
        const response = await gamesApi.getById(id);
        if (response?.data) {
          window.location.reload();
        }
      } else {
        toast.error(t('errors.syncPending') || 'Please wait for sync to complete');
      }
    } catch (error: any) {
      console.error('Failed to save results:', error);
      toast.error(error?.response?.data?.message || t('errors.generic'));
    } finally {
      setIsSaving(false);
      setShowFinishConfirmation(false);
    }
  };

  const handleRestart = async () => {
    if (!id || !user?.id) return;
    
    setIsRestarting(true);
    try {
      await engine.resetGame();
      
      if (engine.pendingOpsCount === 0) {
        const response = await gamesApi.getById(id);
        if (response?.data) {
          const updatedGame = { ...response.data, resultsStatus: 'NONE' };
          engine.updateGame(updatedGame);
          setIsResultsEntryMode(false);
        }
        toast.success(t('common.restarted') || 'Game restarted successfully');
      } else {
        toast.error(t('errors.syncPending') || 'Please wait for sync to complete');
      }
    } catch (error: any) {
      console.error('Failed to restart game:', error);
      const errorMessage = error?.response?.data?.message || error?.message || t('errors.generic');
      
      if (error?.response?.status === 409) {
        toast.error(errorMessage);
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsRestarting(false);
      setShowRestartConfirmation(false);
    }
  };

  const handleEdit = async () => {
    if (!id || !user?.id) return;
    
    setIsEditing(true);
    try {
      const state = GameResultsEngine.getState();
      const baseVersion = state.shadow?.version;
      
      await resultsApi.editGameResults(id, baseVersion);
      
      const response = await gamesApi.getById(id);
      if (response?.data) {
        const updatedGame = response.data;
        engine.updateGame(updatedGame);
        setIsEditingResults(true);
      }
      toast.success(t('common.saved') || 'Results ready for editing');
    } catch (error: any) {
      console.error('Failed to edit results:', error);
      const errorMessage = error?.response?.data?.message || error?.message || t('errors.generic');
      
      if (error?.response?.status === 409) {
        toast.error(errorMessage);
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsEditing(false);
      setShowEditConfirmation(false);
    }
  };

  const getRestartText = () => {
    if (!game) return t('gameResults.restartGame');
    const entityType = game.entityType.toLowerCase();
    if (entityType === 'tournament') return t('gameResults.restartTournament');
    if (entityType === 'bar') return t('gameResults.restartBar');
    if (entityType === 'training') return t('gameResults.restartTraining');
    return t('gameResults.restartGame');
  };

  const getFinishText = () => {
    if (!game) return t('gameResults.finishGame');
    const entityType = game.entityType.toLowerCase();
    if (entityType === 'tournament') return t('gameResults.finishTournament');
    if (entityType === 'bar') return t('gameResults.finishBar');
    if (entityType === 'training') return t('gameResults.finishTraining');
    return t('gameResults.finishGame');
  };

  const getRestartTitle = () => {
    if (!game) return t('gameResults.restartGameTitle');
    const entityType = game.entityType.toLowerCase();
    if (entityType === 'tournament') return t('gameResults.restartTournamentTitle');
    if (entityType === 'bar') return t('gameResults.restartBarTitle');
    if (entityType === 'training') return t('gameResults.restartTrainingTitle');
    return t('gameResults.restartGameTitle');
  };

  const getFinishTitle = () => {
    if (!game) return t('gameResults.finishGameTitle');
    const entityType = game.entityType.toLowerCase();
    if (entityType === 'tournament') return t('gameResults.finishTournamentTitle');
    if (entityType === 'bar') return t('gameResults.finishBarTitle');
    if (entityType === 'training') return t('gameResults.finishTrainingTitle');
    return t('gameResults.finishGameTitle');
  };

  const getEditTitle = () => {
    if (!game) return t('gameResults.editGameTitle');
    const entityType = game.entityType.toLowerCase();
    if (entityType === 'tournament') return t('gameResults.editTournamentTitle');
    if (entityType === 'bar') return t('gameResults.editBarTitle');
    if (entityType === 'training') return t('gameResults.editTrainingTitle');
    return t('gameResults.editGameTitle');
  };

  const handlePlayerSelect = async (playerId: string) => {
    if (!selectedMatchTeam || !effectiveCanEdit) return;

    const { roundId, matchId, team } = selectedMatchTeam;
    
    const actualRoundId = roundId || (hasMultiRounds && expandedRoundId ? expandedRoundId : 'round-1');
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
    
    setShowPlayerSelector(false);
    setSelectedMatchTeam(null);
  };

  const handleCourtSelect = async (courtId: string) => {
    if (!selectedCourtMatch) return;

    await engine.setMatchCourt(selectedCourtMatch.roundId, selectedCourtMatch.matchId, courtId);
    setShowCourtModal(false);
    setSelectedCourtMatch(null);
  };

  const handleCourtClick = (roundId: string, matchId: string) => {
    setSelectedCourtMatch({ roundId, matchId });
    setShowCourtModal(true);
  };

  const handleSetupConfirm = async (params: {
    fixedNumberOfSets: number;
    maxTotalPointsPerSet: number;
    maxPointsPerTeam: number;
    winnerOfGame: WinnerOfGame;
    winnerOfMatch: WinnerOfMatch;
    participantLevelUpMode: any;
    matchGenerationType: any;
    prohibitMatchesEditing?: boolean;
    pointsPerWin: number;
    pointsPerLoose: number;
    pointsPerTie: number;
  }) => {
    if (!id || !user?.id) return;
    
    try {
      await gamesApi.update(id, {
        fixedNumberOfSets: params.fixedNumberOfSets,
        maxTotalPointsPerSet: params.maxTotalPointsPerSet,
        maxPointsPerTeam: params.maxPointsPerTeam,
        winnerOfGame: params.winnerOfGame,
        winnerOfMatch: params.winnerOfMatch,
        participantLevelUpMode: params.participantLevelUpMode,
        matchGenerationType: params.matchGenerationType,
        prohibitMatchesEditing: params.prohibitMatchesEditing,
        pointsPerWin: params.pointsPerWin,
        pointsPerLoose: params.pointsPerLoose,
        pointsPerTie: params.pointsPerTie,
      });
      
      const response = await gamesApi.getById(id);
      if (response?.data) {
        const updatedGame = response.data;
        engine.updateGame(updatedGame);
        
        setShowSetupModal(false);
        
        if (isPresetGame) {
          await engine.initializePresetMatches();
        } else {
          await engine.initializeDefaultRound();
        }
        
        setIsResultsEntryMode(true);
        setIsEditingResults(true);
      }
    } catch (error: any) {
      console.error('Failed to update game parameters:', error);
      toast.error(error?.response?.data?.message || t('errors.generic'));
    }
  };

  const handleAcceptServer = async () => {
    setIsResolvingConflict(true);
    try {
      await GameResultsEngine.resolveConflictsAcceptServer();
      setShowConflictModal(false);
      setConflicts([]);
      toast.success(t('conflicts.serverAccepted') || 'Server changes accepted');
    } catch (error: any) {
      console.error('Failed to accept server:', error);
      toast.error(error?.response?.data?.message || t('errors.generic'));
    } finally {
      setIsResolvingConflict(false);
    }
  };

  const handleForceClient = async () => {
    setIsResolvingConflict(true);
    try {
      await GameResultsEngine.resolveConflictsForceClient();
      setShowConflictModal(false);
      setConflicts([]);
      toast.success(t('conflicts.clientForced') || 'Your changes have been applied');
    } catch (error: any) {
      console.error('Failed to force client:', error);
      toast.error(error?.response?.data?.message || t('errors.generic'));
    } finally {
      setIsResolvingConflict(false);
    }
  };


  const handleContainerClick = (e: React.MouseEvent) => {
    if (!isPresetGame && !game?.prohibitMatchesEditing && editingMatchId && effectiveCanEdit) {
      const target = e.target as HTMLElement;
      const isClickInsideMatch = target.closest('[data-match-container]');
      if (!isClickInsideMatch) {
        engine.setEditingMatchId(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4 bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">{t('errors.notFound')}</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <div 
        className="fixed top-0 bottom-0 w-full bg-gray-50 dark:bg-gray-900 z-50 flex flex-col"
        style={{ 
          left: mounted ? '0' : '100%',
          transition: 'left 300ms ease-out'
        }}
      >
      {/* Header Section */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-lg">
        {/* Header Part 1: Main header */}
        <div className="h-16 px-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/games/${id}`)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-110 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ArrowLeft size={20} />
              {t('common.back')}
            </button>
            {isEditingResults && (
              <div className="p-2">
                <SyncStatusIcon 
                  status={syncStatus} 
                  onStatusChange={(status) => engine.setSyncStatus(status)}
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end">
            {canEdit && isResultsEntryMode && isEditingResults && (
              <button
                onClick={() => setShowRestartConfirmation(true)}
                disabled={isRestarting}
                className="px-4 py-2 text-sm rounded-lg font-medium transition-colors bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRestarting ? t('common.loading') : getRestartText()}
              </button>
            )}
          </div>
        </div>
        
        {/* Header Part 2: Tab Controller */}
        {isResultsEntryMode && (
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="container mx-auto">
              <div className="flex justify-center space-x-1 py-2 px-4">
                <button
                  onClick={() => setActiveTab('scores')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'scores'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {t('gameResults.scores')}
                </button>
                {game?.resultsStatus === 'FINAL' && (
                  <button
                    onClick={() => setActiveTab('results')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'results'
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t('gameResults.results')}
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('stats')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'stats'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {t('gameResults.stats') || 'Stats'}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>
      
      {/* Main Section - Scrollable */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <div className="container mx-auto px-4 py-6">
          <div>
      {game?.resultsStatus === 'FINAL' && activeTab === 'results' ? (
        <OutcomesDisplay outcomes={game.outcomes || []} affectsRating={game.affectsRating} gameId={game.id} />
      ) : game?.resultsStatus !== 'NONE' && activeTab === 'stats' ? (
        <PlayerStatsPanel game={game} rounds={rounds} />
      ) : !isResultsEntryMode ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <GameStatusDisplay gameState={gameState} />
          {canEdit && gameState?.canEdit && (
            <div className="flex flex-col items-center gap-4">
              {needsGameSetup && (
                <button
                  onClick={() => setShowSetupModal(true)}
                  className="px-6 py-3 text-base rounded-xl font-semibold transition-all duration-300 bg-gray-600 hover:bg-gray-700 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                >
                  {t('gameResults.setupGame')}
                </button>
              )}
              <button
                onClick={async () => {
                  if (rounds.length === 0) {
                    if (isPresetGame) {
                      await engine.initializePresetMatches();
                    } else {
                      await engine.initializeDefaultRound();
                    }
                  }
                  setIsResultsEntryMode(true);
                  // Enable editing for all statuses when entering manually
                  const resultsStatus = game?.resultsStatus || 'NONE';
                  if (resultsStatus === 'FINAL') {
                    setIsEditingResults(false); // Show read-only first for FINAL
                  } else {
                    setIsEditingResults(true);
                  }
                }}
                className="group relative px-8 py-4 text-lg rounded-xl font-semibold transition-all duration-300 bg-gradient-to-r from-primary-500 to-blue-600 hover:from-primary-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2">
                  {(() => {
                    const resultsStatus = game?.resultsStatus || 'NONE';
                    if (resultsStatus === 'FINAL') {
                      return t('gameResults.viewResults');
                    } else if (resultsStatus === 'IN_PROGRESS') {
                      return t('gameResults.continueResultsEntry');
                    } else {
                      return t('gameResults.startResultsEntry');
                    }
                  })()}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div 
          className={`space-y-1 w-full scrollbar-hide hover:scrollbar-thin hover:scrollbar-thumb-gray-300 dark:hover:scrollbar-thumb-gray-600 ${
            dragAndDrop.isDragging ? 'overflow-hidden' : ''
          } pb-4`}
          onDragOver={dragAndDrop.handleDragOver}
          onClick={handleContainerClick}
        >
          {(hasMultiRounds) ? (
            <div className="space-y-1 pt-4 pb-4">
              {rounds.map((round) => (
                <RoundCard
                  key={round.id}
                  round={round}
                  players={players}
                  isPresetGame={isPresetGame}
                  isExpanded={expandedRoundId === round.id}
                  canEditResults={effectiveCanEdit && isResultsEntryMode}
                  editingMatchId={editingMatchId}
                  draggedPlayer={dragAndDrop.draggedPlayer}
                  showDeleteButton={rounds.length > 1 && effectiveCanEdit}
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
                    if (!game?.prohibitMatchesEditing && editingMatchId !== matchId) {
                      engine.setEditingMatchId(matchId);
                    }
                  }}
                  onSetClick={(matchId, setIndex) => setShowSetModal({ roundId: round.id, matchId, setIndex })}
                  onRemovePlayer={(matchId, team, playerId) => engine.removePlayerFromTeam(round.id, matchId, team, playerId)}
                  onDragOver={dragAndDrop.handleDragOver}
                  onDrop={(e, matchId, team) => {
                    if (e) e.preventDefault();
                    if (!dragAndDrop.draggedPlayer) return;
                    engine.addPlayerToTeam(round.id, matchId, team, dragAndDrop.draggedPlayer);
                    dragAndDrop.handleDragEnd();
                  }}
                  onPlayerPlaceholderClick={(matchId, team) => {
                    setSelectedMatchTeam({ roundId: round.id, matchId, team });
                    setShowPlayerSelector(true);
                  }}
                  canEnterResults={(matchId) => {
                    const match = round.matches.find(m => m.id === matchId);
                    return match ? canEnterResults(match) : false;
                  }}
                  showCourtLabel={effectiveShowCourts}
                  courts={game?.gameCourts?.map(gc => gc.court) || []}
                  onCourtClick={(matchId) => handleCourtClick(round.id, matchId)}
                  fixedNumberOfSets={game?.fixedNumberOfSets}
                  prohibitMatchesEditing={game?.prohibitMatchesEditing}
                />
              ))}
              
              {effectiveCanEdit && (
                <div className="flex justify-center">
                  <button
                    onClick={() => engine.addRound()}
                    className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors shadow-lg flex items-center gap-2"
                  >
                    <Plus size={20} />
                    {t('gameResults.addRound')}
                  </button>
                </div>
              )}

              {!isPresetGame && !game?.prohibitMatchesEditing && editingMatchId && effectiveCanEdit && expandedRoundId && (
                <AvailablePlayersFooter
                  players={players}
                  editingMatch={(() => {
                    const expandedRound = rounds.find(r => r.id === expandedRoundId);
                    return expandedRound?.matches.find(m => m.id === editingMatchId);
                  })()}
                  draggedPlayer={dragAndDrop.draggedPlayer}
                  onDragStart={dragAndDrop.handleDragStart}
                  onDragEnd={dragAndDrop.handleDragEnd}
                  onTouchStart={dragAndDrop.handleTouchStart}
                  onTouchMove={dragAndDrop.handleTouchMove}
                  onTouchEnd={handleTouchEndWrapper}
                  bottomOffset={finishButtonPanelHeight}
                />
              )}
            </div>
          ) : (
            <div className="space-y-0 pt-0 pb-0">
            {matches.map((match, matchIndex) => (
              effectiveHorizontalLayout ? (
                <HorizontalMatchCard
                  key={match.id}
                  match={match}
                  matchIndex={matchIndex}
                  players={players}
                  isPresetGame={isPresetGame}
                  isEditing={editingMatchId === match.id}
                  canEditResults={effectiveCanEdit && isResultsEntryMode}
                  draggedPlayer={dragAndDrop.draggedPlayer}
                  showDeleteButton={matches.length > 1 && !isPresetGame && editingMatchId === match.id && effectiveCanEdit && !game?.prohibitMatchesEditing}
                  onRemoveMatch={() => removeMatch(match.id)}
                  onMatchClick={() => {
                    if (!game?.prohibitMatchesEditing && editingMatchId !== match.id) {
                      engine.setEditingMatchId(match.id);
                    }
                  }}
                  onSetClick={(setIndex: number) => setShowSetModal({ matchId: match.id, setIndex })}
                  onRemovePlayer={(team: 'teamA' | 'teamB', playerId: string) => removePlayerFromTeam(match.id, team, playerId)}
                  onDragOver={dragAndDrop.handleDragOver}
                  onDrop={(e: React.DragEvent, team: 'teamA' | 'teamB') => handleDrop(e, match.id, team)}
                  onPlayerPlaceholderClick={(team: 'teamA' | 'teamB') => {
                    setSelectedMatchTeam({ matchId: match.id, team });
                    setShowPlayerSelector(true);
                  }}
                  canEnterResults={canEnterResults(match)}
                  showCourtLabel={effectiveShowCourts}
                  selectedCourt={game?.gameCourts?.map(gc => gc.court).find(c => c.id === match.courtId) || null}
                  courts={game?.gameCourts?.map(gc => gc.court) || []}
                  onCourtClick={() => handleCourtClick('round-1', match.id)}
                  fixedNumberOfSets={game?.fixedNumberOfSets}
                  prohibitMatchesEditing={game?.prohibitMatchesEditing}
                />
              ) : (
                <MatchCard
                  key={match.id}
                  match={match}
                  matchIndex={matchIndex}
                  players={players}
                  isPresetGame={isPresetGame}
                  isEditing={editingMatchId === match.id}
                  canEditResults={effectiveCanEdit && isResultsEntryMode}
                  draggedPlayer={dragAndDrop.draggedPlayer}
                  showDeleteButton={matches.length > 1 && !isPresetGame && editingMatchId === match.id && effectiveCanEdit && !game?.prohibitMatchesEditing}
                  onRemoveMatch={() => removeMatch(match.id)}
                  onMatchClick={() => {
                    if (!game?.prohibitMatchesEditing && editingMatchId !== match.id) {
                      engine.setEditingMatchId(match.id);
                    }
                  }}
                  onSetClick={(setIndex) => setShowSetModal({ matchId: match.id, setIndex })}
                  onRemovePlayer={(team, playerId) => removePlayerFromTeam(match.id, team, playerId)}
                  onDragOver={dragAndDrop.handleDragOver}
                  onDrop={(e, team) => handleDrop(e, match.id, team)}
                  onPlayerPlaceholderClick={(team) => {
                    setSelectedMatchTeam({ matchId: match.id, team });
                    setShowPlayerSelector(true);
                  }}
                  canEnterResults={canEnterResults(match)}
                  showCourtLabel={effectiveShowCourts}
                  selectedCourt={game?.gameCourts?.map(gc => gc.court).find(c => c.id === match.courtId) || null}
                  courts={game?.gameCourts?.map(gc => gc.court) || []}
                  onCourtClick={() => handleCourtClick('round-1', match.id)}
                  fixedNumberOfSets={game?.fixedNumberOfSets}
                  prohibitMatchesEditing={game?.prohibitMatchesEditing}
                />
              )
            ))}
            
            {!isPresetGame && !game?.prohibitMatchesEditing && editingMatchId && effectiveCanEdit && (
              <div 
                className="flex justify-center mt-4"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    engine.setEditingMatchId(null);
                  }
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    addMatch();
                  }}
                  className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-colors shadow-lg"
                >
                  <Plus size={20} />
                </button>
              </div>
            )}

            {!isPresetGame && !game?.prohibitMatchesEditing && editingMatchId && effectiveCanEdit && (
              <AvailablePlayersFooter
                players={players}
                editingMatch={matches.find(m => m.id === editingMatchId)}
                draggedPlayer={dragAndDrop.draggedPlayer}
                onDragStart={dragAndDrop.handleDragStart}
                onDragEnd={dragAndDrop.handleDragEnd}
                onTouchStart={dragAndDrop.handleTouchStart}
                onTouchMove={dragAndDrop.handleTouchMove}
                onTouchEnd={handleTouchEndWrapper}
                bottomOffset={finishButtonPanelHeight}
              />
            )}
          </div>
          )}
        </div>
      )}

          <AnimatePresence>
            {showSetModal && (() => {
              const roundId = showSetModal.roundId || 'round-1';
              const round = rounds.find(r => r.id === roundId);
              const match = round?.matches.find(m => m.id === showSetModal.matchId);
              if (!match) return null;

              const canRemove = (() => {
                const currentSet = match.sets[showSetModal.setIndex];
                if (!currentSet) return false;
                const isLastSet = showSetModal.setIndex === match.sets.length - 1;
                const isZeroZero = currentSet.teamA === 0 && currentSet.teamB === 0;
                return match.sets.length > 1 && !(isLastSet && isZeroZero);
              })();

              if (effectiveHorizontalLayout) {
                return (
                  <HorizontalScoreEntryModal
                    key={`horizontal-${showSetModal.matchId}-${showSetModal.setIndex}`}
                    match={match}
                    setIndex={showSetModal.setIndex}
                    players={players}
                    maxTotalPointsPerSet={game?.maxTotalPointsPerSet}
                    maxPointsPerTeam={game?.maxPointsPerTeam}
                    fixedNumberOfSets={game?.fixedNumberOfSets}
                    onSave={(matchId, setIndex, teamAScore, teamBScore) => {
                      updateSetResult(matchId, setIndex, teamAScore, teamBScore);
                    }}
                    onRemove={(matchId, setIndex) => {
                      removeSet(matchId, setIndex);
                    }}
                    onClose={() => setShowSetModal(null)}
                    canRemove={canRemove}
                  />
                );
              }

              return (
                <SetResultModal
                  match={match}
                  setIndex={showSetModal.setIndex}
                  players={players}
                  maxTotalPointsPerSet={game?.maxTotalPointsPerSet}
                  maxPointsPerTeam={game?.maxPointsPerTeam}
                  fixedNumberOfSets={game?.fixedNumberOfSets}
                  onSave={(matchId, setIndex, teamAScore, teamBScore) => {
                    updateSetResult(matchId, setIndex, teamAScore, teamBScore);
                  }}
                  onRemove={(matchId, setIndex) => {
                    removeSet(matchId, setIndex);
                  }}
                  onClose={() => setShowSetModal(null)}
                  canRemove={canRemove}
                />
              );
            })()}
          </AnimatePresence>

          {showPlayerSelector && selectedMatchTeam && (
            <TeamPlayerSelector
              gameParticipants={game?.participants || []}
              onClose={() => {
                setShowPlayerSelector(false);
                setSelectedMatchTeam(null);
              }}
              onConfirm={handlePlayerSelect}
              selectedPlayerIds={(() => {
                const roundId = selectedMatchTeam.roundId || (hasMultiRounds && expandedRoundId ? expandedRoundId : 'round-1');
                const round = rounds.find(r => r.id === roundId);
                const match = round?.matches.find(m => m.id === selectedMatchTeam.matchId);
                if (!match) return [];
                return [...match.teamA, ...match.teamB];
              })()}
              title={t('games.addPlayer')}
            />
          )}

          {showCourtModal && selectedCourtMatch && (
            <CourtModal
              isOpen={showCourtModal}
              onClose={() => {
                setShowCourtModal(false);
                setSelectedCourtMatch(null);
              }}
              courts={game?.gameCourts?.map(gc => gc.court) || []}
              selectedId={(() => {
                const round = rounds.find(r => r.id === selectedCourtMatch.roundId);
                const match = round?.matches.find(m => m.id === selectedCourtMatch.matchId);
                return match?.courtId || '';
              })()}
              onSelect={handleCourtSelect}
              entityType="GAME"
              showNotBookedOption={false}
            />
          )}

          {dragAndDrop.draggedPlayer && dragAndDrop.dragPosition && (
            <FloatingDraggedPlayer
              player={players.find(p => p.id === dragAndDrop.draggedPlayer) || null}
              position={dragAndDrop.dragPosition}
            />
          )}

          {showRestartConfirmation && (
            <ConfirmationModal
              isOpen={showRestartConfirmation}
              title={getRestartTitle()}
              message={t('gameResults.restartConfirmationMessage')}
              confirmText={t('common.confirm')}
              cancelText={t('common.cancel')}
              confirmVariant="danger"
              onConfirm={handleRestart}
              onClose={() => setShowRestartConfirmation(false)}
            />
          )}

          {showFinishConfirmation && (
            <ConfirmationModal
              isOpen={showFinishConfirmation}
              title={getFinishTitle()}
              message={t('gameResults.finishConfirmationMessage')}
              confirmText={t('common.confirm')}
              cancelText={t('common.cancel')}
              confirmVariant="primary"
              onConfirm={handleFinish}
              onClose={() => setShowFinishConfirmation(false)}
            />
          )}

          {showEditConfirmation && (
            <ConfirmationModal
              isOpen={showEditConfirmation}
              title={getEditTitle()}
              message={t('gameResults.editConfirmationMessage')}
              confirmText={t('common.confirm')}
              cancelText={t('common.cancel')}
              confirmVariant="danger"
              onConfirm={handleEdit}
              onClose={() => setShowEditConfirmation(false)}
            />
          )}

          {showSetupModal && game && (
            <GameSetupModal
              isOpen={showSetupModal}
              entityType={game.entityType}
              hasMultiRounds={game.hasMultiRounds}
              initialValues={{
                fixedNumberOfSets: game.fixedNumberOfSets,
                maxTotalPointsPerSet: game.maxTotalPointsPerSet,
                maxPointsPerTeam: game.maxPointsPerTeam,
                winnerOfGame: game.winnerOfGame,
                winnerOfMatch: game.winnerOfMatch,
                participantLevelUpMode: game.participantLevelUpMode,
                matchGenerationType: game.matchGenerationType,
                pointsPerWin: game.pointsPerWin,
                pointsPerLoose: game.pointsPerLoose,
                pointsPerTie: game.pointsPerTie,
              }}
              onClose={() => setShowSetupModal(false)}
              onConfirm={handleSetupConfirm}
            />
          )}

          {showConflictModal && (
            <ConflictResolutionModal
              isOpen={showConflictModal}
              conflicts={conflicts}
              onForceClientWin={handleForceClient}
              onAcceptServer={handleAcceptServer}
              onClose={() => setShowConflictModal(false)}
              isProcessing={isResolvingConflict}
            />
          )}
          </div>
        </div>
      </main>

      {/* Footer Section */}
      <footer className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg">
        {showFinishButton && (
          <div className="p-4">
            <div className="container mx-auto flex justify-center">
              <button
                onClick={() => setShowFinishConfirmation(true)}
                disabled={isSaving}
                className="px-8 py-3 text-base rounded-lg font-medium transition-colors bg-green-500 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isSaving ? t('common.loading') : getFinishText()}
              </button>
            </div>
          </div>
        )}
        {showEditButton && (
          <div className="p-4">
            <div className="container mx-auto flex justify-center">
              <button
                onClick={() => setShowEditConfirmation(true)}
                disabled={isEditing}
                className="px-8 py-3 text-base rounded-lg font-medium transition-colors bg-blue-500 hover:bg-blue-600 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEditing ? t('common.loading') : t('gameResults.editResults')}
              </button>
            </div>
          </div>
        )}
      </footer>
      </div>
    </>
  );
};

