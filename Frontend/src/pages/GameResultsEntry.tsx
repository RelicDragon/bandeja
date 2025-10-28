import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus } from 'lucide-react';
import { SetResultModal } from '@/components/SetResultModal';
import { CourtModal } from '@/components/CourtModal';
import { TeamPlayerSelector } from '@/components';
import { gamesApi } from '@/api';
import { Game, User } from '@/types';
import toast from 'react-hot-toast';
import { canUserEditResults, canUserSeeGame, getGameResultStatus } from '@/utils/gameResults';
import { useAuthStore } from '@/store/authStore';
import { GameState } from '@/types/gameResults';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useMatchManagement } from '@/hooks/useMatchManagement';
import { useRoundManagement } from '@/hooks/useRoundManagement';
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
  horizontalLayout?: boolean;
}

export const GameResultsEntry = ({ showCourts = false, horizontalLayout = false }: GameResultsEntryProps) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  
  const [game, setGame] = useState<Game | null>(null);
  const [showSetModal, setShowSetModal] = useState<{ roundId?: string; matchId: string; setIndex: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPlayerSelector, setShowPlayerSelector] = useState(false);
  const [selectedMatchTeam, setSelectedMatchTeam] = useState<{ roundId?: string; matchId: string; team: 'teamA' | 'teamB' } | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [multiRounds, setMultiRounds] = useState(false);
  const [courtAssignments, setCourtAssignments] = useState<Record<string, string>>({});
  const [showCourtModal, setShowCourtModal] = useState(false);
  const [selectedCourtMatchId, setSelectedCourtMatchId] = useState<string | null>(null);

  // Test switches for development
  const [testShowCourts, setTestShowCourts] = useState(false);
  const [testHorizontalLayout, setTestHorizontalLayout] = useState(false);

  // Use test values if set, otherwise use props
  const effectiveShowCourts = testShowCourts || showCourts;
  const effectiveHorizontalLayout = testHorizontalLayout || horizontalLayout;

  const players = useMemo(() => (game?.participants.map(p => p.user) || []) as User[], [game?.participants]);

  const matchManagement = useMatchManagement({
    players,
    hasResults: game?.hasResults || false,
    canEditResults: canEdit,
  });

  const roundManagement = useRoundManagement({
    players,
    hasResults: game?.hasResults || false,
    canEditResults: canEdit,
    multiRounds: true,
  });

  const {
    matches,
    setMatches,
    editingMatchId,
    setEditingMatchId,
    isPresetGame,
    addMatch,
    removeMatch,
    removePlayerFromTeam,
    handleDrop: handleMatchDrop,
    updateSetResult,
    removeSet,
    canEnterResults,
  } = multiRounds ? {
    matches: roundManagement.rounds.flatMap(r => r.matches),
    setMatches: (newMatches: any) => {
      if (roundManagement.rounds.length > 0) {
        const updatedRounds = roundManagement.rounds.map((r, idx) => ({
          ...r,
          matches: newMatches.slice(idx, idx + 1)
        }));
        roundManagement.setRounds(updatedRounds);
      }
    },
    editingMatchId: roundManagement.editingMatchId,
    setEditingMatchId: roundManagement.setEditingMatchId,
    isPresetGame: roundManagement.isPresetGame,
    addMatch: () => {
      if (roundManagement.expandedRoundId) {
        roundManagement.addMatch(roundManagement.expandedRoundId);
      }
    },
    removeMatch: (matchId: string) => {
      if (roundManagement.expandedRoundId) {
        roundManagement.removeMatch(roundManagement.expandedRoundId, matchId);
      }
    },
    removePlayerFromTeam: (matchId: string, team: 'teamA' | 'teamB', playerId: string) => {
      if (roundManagement.expandedRoundId) {
        roundManagement.removePlayerFromTeam(roundManagement.expandedRoundId, matchId, team, playerId);
      }
    },
    handleDrop: (matchId: string, team: 'teamA' | 'teamB', draggedPlayer: string) => {
      if (roundManagement.expandedRoundId) {
        roundManagement.handleDrop(roundManagement.expandedRoundId, matchId, team, draggedPlayer);
      }
    },
    updateSetResult: (matchId: string, setIndex: number, teamAScore: number, teamBScore: number) => {
      if (roundManagement.expandedRoundId) {
        roundManagement.updateSetResult(roundManagement.expandedRoundId, matchId, setIndex, teamAScore, teamBScore);
      }
    },
    removeSet: (matchId: string, setIndex: number) => {
      if (roundManagement.expandedRoundId) {
        roundManagement.removeSet(roundManagement.expandedRoundId, matchId, setIndex);
      }
    },
    canEnterResults: roundManagement.canEnterResults,
  } : matchManagement;

  const dragAndDrop = useDragAndDrop(canEdit);

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
    const fetchGame = async () => {
      if (!id) return;

      try {
        const response = await gamesApi.getById(id);
        setGame(response.data);
        
        // Check if user can see the game
        if (!canUserSeeGame(response.data, user)) {
          toast.error(t('errors.accessDenied'));
          navigate(`/games/${id}`);
          return;
        }
        
        const canEditRes = canUserEditResults(response.data, user);
        setCanEdit(canEditRes);
        
        const resultStatus = getGameResultStatus(response.data, user);
        const now = new Date();
        const startTime = new Date(response.data.startTime);
        const endTime = new Date(response.data.endTime);
        const hoursSinceEnd = (now.getTime() - endTime.getTime()) / (1000 * 60 * 60);
        
        let gameStateType: GameState['type'];
        let showInputs = false;
        let showClock = false;
        
        if (resultStatus?.message === 'games.results.problems.accessDenied') {
          gameStateType = 'ACCESS_DENIED';
        } else if (resultStatus?.message === 'games.results.problems.gameArchived') {
          gameStateType = 'GAME_ARCHIVED';
        } else if (resultStatus?.message === 'games.results.problems.gameNotStarted') {
          gameStateType = 'GAME_NOT_STARTED';
          showClock = canEditRes;
        } else if (resultStatus?.message === 'games.results.problems.insufficientPlayers') {
          gameStateType = 'INSUFFICIENT_PLAYERS';
          showClock = canEditRes;
        } else if (response.data.hasResults) {
          gameStateType = 'HAS_RESULTS';
          showInputs = true;
        } else {
          gameStateType = 'NO_RESULTS';
          showInputs = canEditRes && now >= startTime && hoursSinceEnd <= 24;
          showClock = canEditRes && now >= startTime && hoursSinceEnd <= 24;
        }
        
        setGameState({
          type: gameStateType,
          message: resultStatus?.message || 'games.results.positive.noResultsYet',
          canEdit: canEditRes,
          showInputs,
          showClock
        });
        
        if (response.data.hasResults) {
          try {
            const resultsResponse = await gamesApi.getResults(id);
            const apiResults = resultsResponse.data;
            const convertedMatches = apiResults.map((result: any, index: number) => ({
              id: `match-${index + 1}`,
              teamA: result.team1 || [],
              teamB: result.team2 || [],
              sets: result.sets || [{ teamA: 0, teamB: 0 }]
            }));
            
            if (multiRounds) {
              const initialRound = {
                id: 'round-1',
                name: `${t('gameResults.round')} 1`,
                matches: convertedMatches
              };
              roundManagement.setRounds([initialRound]);
              roundManagement.setExpandedRoundId(initialRound.id);
            } else {
              matchManagement.setMatches(convertedMatches);
            }
          } catch (error) {
            console.error('Failed to fetch results:', error);
          }
        }
      } catch (error) {
        console.error('Failed to fetch game:', error);
        toast.error(t('errors.generic'));
        navigate(`/games/${id}`);
      } finally {
        setLoading(false);
        setTimeout(() => {
          setMounted(true);
        }, 300);
      }
    };

    fetchGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate, t, user, multiRounds]);

  useEffect(() => {
    if (matches.length === 1 && !editingMatchId 
      && !isPresetGame 
      && canEdit 
      && matches[0].teamA.length === 0 
      && matches[0].teamB.length === 0 && !mounted) {
      setEditingMatchId(matches[0].id);
    }
  }, [matches, editingMatchId, isPresetGame, canEdit, mounted, setEditingMatchId]);

  useEffect(() => {
    if (isPresetGame || !canEdit) {
      setEditingMatchId(null);
    }
  }, [isPresetGame, canEdit, setEditingMatchId]);

  const handlePlayerSelect = (playerId: string) => {
    if (!selectedMatchTeam || !canEdit) return;

    const { roundId, matchId, team } = selectedMatchTeam;
    
    if (multiRounds && roundId) {
      const round = roundManagement.rounds.find(r => r.id === roundId);
      if (!round) return;
      
      const match = round.matches.find(m => m.id === matchId);
      if (!match) return;

      const otherTeam = team === 'teamA' ? 'teamB' : 'teamA';
      const otherTeamPlayers = match[otherTeam];

      if (otherTeamPlayers.includes(playerId) || match[team].includes(playerId)) {
        return;
      }

      const updatedRounds = roundManagement.rounds.map(r => {
        if (r.id === roundId) {
          const updatedMatches = r.matches.map(m => {
            if (m.id === matchId) {
              const currentTeam = [...m[team]];
              if (!currentTeam.includes(playerId)) {
                currentTeam.push(playerId);
              }
              return { ...m, [team]: currentTeam };
            }
            return m;
          });
          return { ...r, matches: updatedMatches };
        }
        return r;
      });

      roundManagement.setRounds(updatedRounds);
    } else {
      const match = matches.find(m => m.id === matchId);
      if (!match) return;

      const otherTeam = team === 'teamA' ? 'teamB' : 'teamA';
      const otherTeamPlayers = match[otherTeam];

      if (otherTeamPlayers.includes(playerId) || match[team].includes(playerId)) {
        return;
      }

      const updatedMatches = matches.map(m => {
        if (m.id === matchId) {
          const currentTeam = [...m[team]];
          if (!currentTeam.includes(playerId)) {
            currentTeam.push(playerId);
          }
          return { ...m, [team]: currentTeam };
        }
        return m;
      });

      setMatches(updatedMatches);
    }
    
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


  const handleContainerClick = (e: React.MouseEvent) => {
    if (!isPresetGame && editingMatchId && canEdit) {
      const target = e.target as HTMLElement;
      const isClickInsideMatch = target.closest('[data-match-container]');
      if (!isClickInsideMatch) {
        setEditingMatchId(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
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
        <div className="h-full px-4 flex items-center justify-between">
          <button
            onClick={() => navigate(`/games/${id}`)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 hover:scale-105 active:scale-110 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft size={20} />
            {t('common.back')}
          </button>
          {canEdit && !game?.hasResults && (
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
          {canEdit && (
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
          {canEdit && (
            <button
              onClick={() => setTestHorizontalLayout(!testHorizontalLayout)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                testHorizontalLayout
                  ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Horizontal
            </button>
          )}
          <div className="w-24"></div>
        </div>
      </header>
      
      <main className="pt-16 pb-6 overflow-x-hidden">
        <div className="container mx-auto px-4 py-6 overflow-x-hidden">
          <div className="overflow-x-hidden">
      {!gameState?.showInputs ? (
        <GameStatusDisplay gameState={gameState} />
      ) : (
        <div 
          className={`space-y-1 h-[calc(100vh-12rem)] w-full scrollbar-hide hover:scrollbar-thin hover:scrollbar-thumb-gray-300 dark:hover:scrollbar-thumb-gray-600 ${
            dragAndDrop.isDragging ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'
          } pb-4`}
          onDragOver={dragAndDrop.handleDragOver}
          onClick={handleContainerClick}
        >
          {multiRounds ? (
            <div className="space-y-1 pt-4 pb-4">
              {roundManagement.rounds.map((round) => (
                <RoundCard
                  key={round.id}
                  round={round}
                  players={players}
                  isPresetGame={isPresetGame}
                  isExpanded={roundManagement.expandedRoundId === round.id}
                  canEditResults={canEdit}
                  editingMatchId={editingMatchId}
                  draggedPlayer={dragAndDrop.draggedPlayer}
                  showDeleteButton={roundManagement.rounds.length > 1 && canEdit}
                  onRemoveRound={() => roundManagement.removeRound(round.id)}
                  onToggleExpand={() => {
                    if (roundManagement.expandedRoundId === round.id) {
                      roundManagement.setExpandedRoundId(null);
                      setEditingMatchId(null);
                    } else {
                      roundManagement.setExpandedRoundId(round.id);
                    }
                  }}
                  onAddMatch={() => roundManagement.addMatch(round.id)}
                  onRemoveMatch={(matchId) => roundManagement.removeMatch(round.id, matchId)}
                  horizontalLayout={effectiveHorizontalLayout}
                  onMatchClick={(matchId) => {
                    if (editingMatchId !== matchId) {
                      setEditingMatchId(matchId);
                    }
                  }}
                  onSetClick={(matchId, setIndex) => setShowSetModal({ roundId: round.id, matchId, setIndex })}
                  onRemovePlayer={(matchId, team, playerId) => roundManagement.removePlayerFromTeam(round.id, matchId, team, playerId)}
                  onDragOver={dragAndDrop.handleDragOver}
                  onDrop={(e, matchId, team) => {
                    if (e) e.preventDefault();
                    if (!dragAndDrop.draggedPlayer) return;
                    roundManagement.handleDrop(round.id, matchId, team, dragAndDrop.draggedPlayer);
                    dragAndDrop.handleDragEnd();
                  }}
                  onPlayerPlaceholderClick={(matchId, team) => {
                    setSelectedMatchTeam({ roundId: round.id, matchId, team });
                    setShowPlayerSelector(true);
                  }}
                  canEnterResults={(matchId) => {
                    const match = round.matches.find(m => m.id === matchId);
                    return match ? roundManagement.canEnterResults(match) : false;
                  }}
                  showCourtLabel={effectiveShowCourts}
                  courtAssignments={courtAssignments}
                  courts={game?.club?.courts || []}
                  onCourtClick={handleCourtClick}
                />
              ))}
              
              {canEdit && (
                <div className="flex justify-center">
                  <button
                    onClick={roundManagement.addRound}
                    className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors shadow-lg flex items-center gap-2"
                  >
                    <Plus size={20} />
                    {t('gameResults.addRound')}
                  </button>
                </div>
              )}

              {!isPresetGame && editingMatchId && canEdit && roundManagement.expandedRoundId && (
                <AvailablePlayersFooter
                  players={players}
                  editingMatch={(() => {
                    const expandedRound = roundManagement.rounds.find(r => r.id === roundManagement.expandedRoundId);
                    return expandedRound?.matches.find(m => m.id === editingMatchId);
                  })()}
                  draggedPlayer={dragAndDrop.draggedPlayer}
                  onDragStart={dragAndDrop.handleDragStart}
                  onDragEnd={dragAndDrop.handleDragEnd}
                  onTouchStart={dragAndDrop.handleTouchStart}
                  onTouchMove={dragAndDrop.handleTouchMove}
                  onTouchEnd={handleTouchEndWrapper}
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
                  canEditResults={canEdit}
                  draggedPlayer={dragAndDrop.draggedPlayer}
                  showDeleteButton={matches.length > 1 && !isPresetGame && editingMatchId === match.id && canEdit}
                  onRemoveMatch={() => removeMatch(match.id)}
                  onMatchClick={() => {
                    if (editingMatchId !== match.id) {
                      setEditingMatchId(match.id);
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
                />
              ) : (
                <MatchCard
                  key={match.id}
                  match={match}
                  matchIndex={matchIndex}
                  players={players}
                  isPresetGame={isPresetGame}
                  isEditing={editingMatchId === match.id}
                  canEditResults={canEdit}
                  draggedPlayer={dragAndDrop.draggedPlayer}
                  showDeleteButton={matches.length > 1 && !isPresetGame && editingMatchId === match.id && canEdit}
                  onRemoveMatch={() => removeMatch(match.id)}
                  onMatchClick={() => {
                    if (editingMatchId !== match.id) {
                      setEditingMatchId(match.id);
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
                />
              )
            ))}
            
            {!isPresetGame && editingMatchId && canEdit && (
              <div 
                className="flex justify-center mt-4"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setEditingMatchId(null);
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

            {!isPresetGame && editingMatchId && canEdit && (
              <AvailablePlayersFooter
                players={players}
                editingMatch={matches.find(m => m.id === editingMatchId)}
                draggedPlayer={dragAndDrop.draggedPlayer}
                onDragStart={dragAndDrop.handleDragStart}
                onDragEnd={dragAndDrop.handleDragEnd}
                onTouchStart={dragAndDrop.handleTouchStart}
                onTouchMove={dragAndDrop.handleTouchMove}
                onTouchEnd={handleTouchEndWrapper}
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
                if (multiRounds && showSetModal.roundId) {
                  const round = roundManagement.rounds.find(r => r.id === showSetModal.roundId);
                  const match = round?.matches.find(m => m.id === showSetModal.matchId);
                  return match?.sets[showSetModal.setIndex] || { teamA: 0, teamB: 0 };
                }
                return matches.find(m => m.id === showSetModal.matchId)?.sets[showSetModal.setIndex] || { teamA: 0, teamB: 0 };
              })()}
              onSave={(matchId, setIndex, teamAScore, teamBScore) => {
                if (multiRounds && showSetModal.roundId) {
                  roundManagement.updateSetResult(showSetModal.roundId, matchId, setIndex, teamAScore, teamBScore);
                } else {
                  updateSetResult(matchId, setIndex, teamAScore, teamBScore);
                }
              }}
              onRemove={(matchId, setIndex) => {
                if (multiRounds && showSetModal.roundId) {
                  roundManagement.removeSet(showSetModal.roundId, matchId, setIndex);
                } else {
                  removeSet(matchId, setIndex);
                }
              }}
              onClose={() => setShowSetModal(null)}
              canRemove={(() => {
                let match;
                if (multiRounds && showSetModal.roundId) {
                  const round = roundManagement.rounds.find(r => r.id === showSetModal.roundId);
                  match = round?.matches.find(m => m.id === showSetModal.matchId);
                } else {
                  match = matches.find(m => m.id === showSetModal.matchId);
                }
                if (!match) return false;
                const currentSet = match.sets[showSetModal.setIndex];
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
                if (multiRounds && selectedMatchTeam.roundId) {
                  const round = roundManagement.rounds.find(r => r.id === selectedMatchTeam.roundId);
                  const match = round?.matches.find(m => m.id === selectedMatchTeam.matchId);
                  if (!match) return [];
                  return [...match.teamA, ...match.teamB];
                }
                const match = matches.find(m => m.id === selectedMatchTeam.matchId);
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
          </div>
        </div>
      </main>
      </div>
    </>
  );
};

