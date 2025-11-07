import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus } from 'lucide-react';
import { SetResultModal } from '@/components/SetResultModal';
import { CourtModal } from '@/components/CourtModal';
import { TeamPlayerSelector, ConfirmationModal, SyncStatusIcon, GameSetupModal, OutcomesDisplay } from '@/components';
import { gamesApi } from '@/api';
import { resultsApi } from '@/api/results';
import { User, WinnerOfGame, WinnerOfRound, WinnerOfMatch } from '@/types';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useGameResultsEngine } from '@/hooks/useGameResultsEngine';
import { GameResultsEngine } from '@/services/gameResultsEngine';
import { 
  GameStatusDisplay, 
  MatchCard,
  HorizontalMatchCard,
  RoundCard,
  AvailablePlayersFooter, 
  FloatingDraggedPlayer 
} from '@/components/gameResults';

interface GameResultsEntryProps {
  showCourts?: boolean;
}

export const GameResultsEntry = ({ showCourts = false }: GameResultsEntryProps) => {
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
  const [multiRounds, setMultiRounds] = useState(false);
  const [courtAssignments, setCourtAssignments] = useState<Record<string, string>>({});
  const [showCourtModal, setShowCourtModal] = useState(false);
  const [selectedCourtMatchId, setSelectedCourtMatchId] = useState<string | null>(null);
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
  const [activeTab, setActiveTab] = useState<'scores' | 'results'>('scores');

  const [testShowCourts, setTestShowCourts] = useState(false);

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

  const isTournament = game?.entityType === 'TOURNAMENT';
  const effectiveShowCourts = isTournament ? (testShowCourts || showCourts) : false;
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
  const showEditButton = canEdit && !isEditingResults && isFinalStatus && isResultsEntryMode;
  const finishButtonPanelHeight = (showFinishButton || showEditButton) ? 80 : 0;

  const handleMatchDrop = async (matchId: string, team: 'teamA' | 'teamB', draggedPlayer: string) => {
    const roundId = multiRounds && expandedRoundId ? expandedRoundId : 'round-1';
    await engine.addPlayerToTeam(roundId, matchId, team, draggedPlayer);
  };

  const updateSetResult = async (matchId: string, setIndex: number, teamAScore: number, teamBScore: number) => {
    const roundId = multiRounds && expandedRoundId ? expandedRoundId : 'round-1';
    const round = rounds.find(r => r.id === roundId);
    const match = round?.matches.find(m => m.id === matchId);
    
    if (!match) return;
    
    const fixedNumberOfSets = game?.fixedNumberOfSets || 0;
    
    if (fixedNumberOfSets === 0) {
      if (setIndex >= match.sets.length) {
        await engine.addSet(roundId, matchId);
      }
      await engine.updateSetScore(roundId, matchId, setIndex, teamAScore, teamBScore);
      
      if (setIndex === match.sets.length - 1 && (teamAScore > 0 || teamBScore > 0)) {
        const updatedRound = rounds.find(r => r.id === roundId);
        const updatedMatch = updatedRound?.matches.find(m => m.id === matchId);
        if (updatedMatch && updatedMatch.sets.length === setIndex + 1) {
          await engine.addSet(roundId, matchId);
        }
      }
    } else {
      while (match.sets.length <= setIndex) {
        await engine.addSet(roundId, matchId);
        const updatedRound = rounds.find(r => r.id === roundId);
        const updatedMatch = updatedRound?.matches.find(m => m.id === matchId);
        if (!updatedMatch) return;
        Object.assign(match, updatedMatch);
      }
      await engine.updateSetScore(roundId, matchId, setIndex, teamAScore, teamBScore);
    }
  };

  const removeSet = async (matchId: string, setIndex: number) => {
    const roundId = multiRounds && expandedRoundId ? expandedRoundId : 'round-1';
    await engine.removeSet(roundId, matchId, setIndex);
  };

  const addMatch = async () => {
    const roundId = multiRounds && expandedRoundId ? expandedRoundId : 'round-1';
    await engine.addMatch(roundId);
  };

  const removeMatch = async (matchId: string) => {
    const roundId = multiRounds && expandedRoundId ? expandedRoundId : 'round-1';
    await engine.removeMatch(roundId, matchId);
  };

  const removePlayerFromTeam = async (matchId: string, team: 'teamA' | 'teamB', playerId: string) => {
    const roundId = multiRounds && expandedRoundId ? expandedRoundId : 'round-1';
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
    if (game && game.entityType !== 'TOURNAMENT') {
      setMultiRounds(false);
      setTestShowCourts(false);
    }
  }, [game]);

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
    
    const actualRoundId = roundId || (multiRounds && expandedRoundId ? expandedRoundId : 'round-1');
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

  const handleCourtSelect = (courtId: string) => {
    if (!selectedCourtMatchId) return;

    setCourtAssignments(prev => ({
      ...prev,
      [selectedCourtMatchId]: courtId
    }));
    setShowCourtModal(false);
    setSelectedCourtMatchId(null);
  };

  const handleCourtClick = (matchId: string) => {
    setSelectedCourtMatchId(matchId);
    setShowCourtModal(true);
  };

  const handleSetupConfirm = async (params: {
    fixedNumberOfSets: number;
    maxTotalPointsPerSet: number;
    maxPointsPerTeam: number;
    winnerOfGame: WinnerOfGame;
    winnerOfRound: WinnerOfRound;
    winnerOfMatch: WinnerOfMatch;
  }) => {
    if (!id || !user?.id) return;
    
    try {
      await gamesApi.update(id, {
        fixedNumberOfSets: params.fixedNumberOfSets,
        maxTotalPointsPerSet: params.maxTotalPointsPerSet,
        maxPointsPerTeam: params.maxPointsPerTeam,
        winnerOfGame: params.winnerOfGame,
        winnerOfRound: params.winnerOfRound,
        winnerOfMatch: params.winnerOfMatch,
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
      }
    } catch (error: any) {
      console.error('Failed to update game parameters:', error);
      toast.error(error?.response?.data?.message || t('errors.generic'));
    }
  };


  const handleContainerClick = (e: React.MouseEvent) => {
    if (!isPresetGame && editingMatchId && effectiveCanEdit) {
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
        className="fixed top-0 bottom-0 w-full bg-gray-50 dark:bg-gray-900 z-50"
        style={{ 
          left: mounted ? '0' : '100%',
          transition: 'left 300ms ease-out'
        }}
      >
      {/* Simple header with back button */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-16 fixed top-0 right-0 left-0 z-40 shadow-lg">
        <div className="h-full px-4 flex items-center justify-between gap-2">
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
            {canEdit && game?.resultsStatus === 'NONE' && game?.entityType === 'TOURNAMENT' && (
              <button
                onClick={() => setMultiRounds(!multiRounds)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  multiRounds
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                Multi-Round
              </button>
            )}
            {canEdit && game?.entityType === 'TOURNAMENT' && (
              <button
                onClick={() => setTestShowCourts(!testShowCourts)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  testShowCourts
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                Courts
              </button>
            )}
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
      </header>

      {/* Tab Selector - Show when game is FINAL */}
      {game?.resultsStatus === 'FINAL' && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 fixed top-16 left-0 right-0 z-30">
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
            </div>
          </div>
        </div>
      )}
      
      <main className={`overflow-x-hidden ${game?.resultsStatus === 'FINAL' ? 'pt-28 pb-24' : 'pt-16 pb-24'}`}>
        <div className="container mx-auto px-4 py-6 overflow-x-hidden">
          <div className="overflow-x-hidden">
      {game?.resultsStatus === 'FINAL' && activeTab === 'results' ? (
        <OutcomesDisplay outcomes={game.outcomes || []} affectsRating={game.affectsRating} gameId={game.id} />
      ) : !isResultsEntryMode ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <GameStatusDisplay gameState={gameState} />
          {canEdit && gameState?.canEdit && (
            <button
              onClick={async () => {
                if (needsGameSetup) {
                  setShowSetupModal(true);
                } else {
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
          )}
        </div>
      ) : (
        <div 
          className={`space-y-1 h-[calc(100vh-12rem)] w-full scrollbar-hide hover:scrollbar-thin hover:scrollbar-thumb-gray-300 dark:hover:scrollbar-thumb-gray-600 ${
            dragAndDrop.isDragging ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'
          } pb-4`}
          onDragOver={dragAndDrop.handleDragOver}
          onClick={handleContainerClick}
        >
          {(multiRounds && isTournament) ? (
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
                    if (editingMatchId !== matchId) {
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
                  courtAssignments={courtAssignments}
                  courts={game?.club?.courts || []}
                  onCourtClick={handleCourtClick}
                  fixedNumberOfSets={game?.fixedNumberOfSets}
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

              {!isPresetGame && editingMatchId && effectiveCanEdit && expandedRoundId && (
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
                  showDeleteButton={matches.length > 1 && !isPresetGame && editingMatchId === match.id && effectiveCanEdit}
                  onRemoveMatch={() => removeMatch(match.id)}
                  onMatchClick={() => {
                    if (editingMatchId !== match.id) {
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
                  selectedCourt={game?.club?.courts?.find(c => c.id === courtAssignments[match.id]) || null}
                  courts={game?.club?.courts || []}
                  onCourtClick={() => handleCourtClick(match.id)}
                  fixedNumberOfSets={game?.fixedNumberOfSets}
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
                  showDeleteButton={matches.length > 1 && !isPresetGame && editingMatchId === match.id && effectiveCanEdit}
                  onRemoveMatch={() => removeMatch(match.id)}
                  onMatchClick={() => {
                    if (editingMatchId !== match.id) {
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
                  selectedCourt={game?.club?.courts?.find(c => c.id === courtAssignments[match.id]) || null}
                  courts={game?.club?.courts || []}
                  onCourtClick={() => handleCourtClick(match.id)}
                  fixedNumberOfSets={game?.fixedNumberOfSets}
                />
              )
            ))}
            
            {!isPresetGame && editingMatchId && effectiveCanEdit && (
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

            {!isPresetGame && editingMatchId && effectiveCanEdit && (
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

          {showSetModal && (
            <SetResultModal
              matchId={showSetModal.matchId}
              setIndex={showSetModal.setIndex}
              set={(() => {
                const roundId = showSetModal.roundId || 'round-1';
                const round = rounds.find(r => r.id === roundId);
                const match = round?.matches.find(m => m.id === showSetModal.matchId);
                return match?.sets[showSetModal.setIndex] || { teamA: 0, teamB: 0 };
              })()}
              onSave={(matchId, setIndex, teamAScore, teamBScore) => {
                updateSetResult(matchId, setIndex, teamAScore, teamBScore);
              }}
              onRemove={(matchId, setIndex) => {
                removeSet(matchId, setIndex);
              }}
              onClose={() => setShowSetModal(null)}
              canRemove={(() => {
                const roundId = showSetModal.roundId || 'round-1';
                const round = rounds.find(r => r.id === roundId);
                const match = round?.matches.find(m => m.id === showSetModal.matchId);
                if (!match) return false;
                const currentSet = match.sets[showSetModal.setIndex];
                if (!currentSet) return false;
                const isLastSet = showSetModal.setIndex === match.sets.length - 1;
                const isZeroZero = currentSet.teamA === 0 && currentSet.teamB === 0;
                return match.sets.length > 1 && !(isLastSet && isZeroZero);
              })()}
            />
          )}

          {showPlayerSelector && selectedMatchTeam && (
            <TeamPlayerSelector
              gameParticipants={game?.participants || []}
              onClose={() => {
                setShowPlayerSelector(false);
                setSelectedMatchTeam(null);
              }}
              onConfirm={handlePlayerSelect}
              selectedPlayerIds={(() => {
                const roundId = selectedMatchTeam.roundId || (multiRounds && expandedRoundId ? expandedRoundId : 'round-1');
                const round = rounds.find(r => r.id === roundId);
                const match = round?.matches.find(m => m.id === selectedMatchTeam.matchId);
                if (!match) return [];
                return [...match.teamA, ...match.teamB];
              })()}
              title={t('games.addPlayer')}
            />
          )}

          {showCourtModal && (
            <CourtModal
              isOpen={showCourtModal}
              onClose={() => {
                setShowCourtModal(false);
                setSelectedCourtMatchId(null);
              }}
              courts={game?.club?.courts || []}
              selectedId={selectedCourtMatchId ? courtAssignments[selectedCourtMatchId] || '' : ''}
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
                winnerOfRound: game.winnerOfRound,
                winnerOfMatch: game.winnerOfMatch,
              }}
              onClose={() => setShowSetupModal(false)}
              onConfirm={handleSetupConfirm}
            />
          )}
          </div>
        </div>
      </main>

      {/* Fixed bottom bar with finish/edit button */}
      {showFinishButton && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 z-40 shadow-lg">
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
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 z-40 shadow-lg">
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
      </div>
    </>
  );
};

