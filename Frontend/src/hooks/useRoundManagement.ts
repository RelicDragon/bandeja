import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Round, Match } from '@/types/gameResults';
import { User } from '@/types';

interface UseRoundManagementProps {
  players: User[];
  hasResults: boolean;
  canEditResults: boolean;
  multiRounds: boolean;
  singleSet?: boolean;
}

export const useRoundManagement = ({
  players,
  hasResults,
  canEditResults,
  multiRounds,
  singleSet = false
}: UseRoundManagementProps) => {
  const { t } = useTranslation();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  const isPresetGame = players.length === 2 || players.length === 4;

  const createDefaultMatches = useCallback((): Match[] => {
    if (players.length === 2) {
      return [{
        id: 'match-1',
        teamA: [players[0].id],
        teamB: [players[1].id],
        sets: [{ teamA: 0, teamB: 0 }]
      }];
    } else if (players.length === 4) {
      return [
        {
          id: 'match-1',
          teamA: [players[0].id, players[1].id],
          teamB: [players[2].id, players[3].id],
          sets: [{ teamA: 0, teamB: 0 }]
        },
        {
          id: 'match-2',
          teamA: [players[0].id, players[2].id],
          teamB: [players[1].id, players[3].id],
          sets: [{ teamA: 0, teamB: 0 }]
        },
        {
          id: 'match-3',
          teamA: [players[0].id, players[3].id],
          teamB: [players[1].id, players[2].id],
          sets: [{ teamA: 0, teamB: 0 }]
        }
      ];
    } else {
      return [{
        id: 'match-1',
        teamA: [],
        teamB: [],
        sets: [{ teamA: 0, teamB: 0 }]
      }];
    }
  }, [players]);

  const initializeRounds = useCallback(() => {
    const defaultMatches = createDefaultMatches();
    const initialRound: Round = {
      id: 'round-1',
      name: `${t('gameResults.round')} 1`,
      matches: defaultMatches
    };
    setRounds([initialRound]);
    if (multiRounds) {
      setExpandedRoundId(initialRound.id);
    }
  }, [createDefaultMatches, multiRounds, t]);

  useEffect(() => {
    if (!hasResults && canEditResults && players.length > 0) {
      initializeRounds();
    }
  }, [hasResults, canEditResults, players.length, initializeRounds]);

  useEffect(() => {
    if (expandedRoundId && !isPresetGame && canEditResults && !editingMatchId) {
      const expandedRound = rounds.find(r => r.id === expandedRoundId);
      if (expandedRound && expandedRound.matches.length > 0) {
        setEditingMatchId(expandedRound.matches[0].id);
      }
    }
  }, [expandedRoundId, isPresetGame, canEditResults, editingMatchId, rounds]);

  const addRound = () => {
    if (!canEditResults || !multiRounds) return;

    const newRound: Round = {
      id: `round-${rounds.length + 1}`,
      name: `${t('gameResults.round')} ${rounds.length + 1}`,
      matches: [{
        id: `round-${rounds.length + 1}-match-1`,
        teamA: [],
        teamB: [],
        sets: [{ teamA: 0, teamB: 0 }]
      }]
    };
    setRounds([...rounds, newRound]);
    setExpandedRoundId(newRound.id);
  };

  const removeRound = (roundId: string) => {
    if (rounds.length > 1 && canEditResults && multiRounds) {
      const updatedRounds = rounds.filter(r => r.id !== roundId);

      // Rename remaining rounds to be sequential
      const renamedRounds = updatedRounds.map((round, index) => ({
        ...round,
        name: `${t('gameResults.round')} ${index + 1}`
      }));

      setRounds(renamedRounds);

      if (expandedRoundId === roundId) {
        setExpandedRoundId(renamedRounds[0]?.id || null);
      }
    }
  };

  const addMatch = (roundId: string) => {
    if (isPresetGame || !canEditResults) return;
    
    const round = rounds.find(r => r.id === roundId);
    if (!round) return;
    
    const newMatch: Match = {
      id: `${roundId}-match-${round.matches.length + 1}`,
      teamA: [],
      teamB: [],
      sets: [{ teamA: 0, teamB: 0 }]
    };
    
    const updatedRounds = rounds.map(r => {
      if (r.id === roundId) {
        return { ...r, matches: [...r.matches, newMatch] };
      }
      return r;
    });
    
    setRounds(updatedRounds);
    setEditingMatchId(newMatch.id);
  };

  const removeMatch = (roundId: string, matchId: string) => {
    if (isPresetGame || !canEditResults) return;
    
    const round = rounds.find(r => r.id === roundId);
    if (!round || round.matches.length <= 1) return;
    
    const updatedRounds = rounds.map(r => {
      if (r.id === roundId) {
        const updatedMatches = r.matches.filter(m => m.id !== matchId);
        return { ...r, matches: updatedMatches };
      }
      return r;
    });
    
    setRounds(updatedRounds);
    
    if (editingMatchId === matchId) {
      const updatedRound = updatedRounds.find(r => r.id === roundId);
      setEditingMatchId(updatedRound?.matches[0]?.id || null);
    }
  };

  const removePlayerFromTeam = (roundId: string, matchId: string, team: 'teamA' | 'teamB', playerId: string) => {
    if (!canEditResults) return;
    
    const updatedRounds = rounds.map(r => {
      if (r.id === roundId) {
        const updatedMatches = r.matches.map(m => {
          if (m.id === matchId) {
            return {
              ...m,
              [team]: m[team].filter(id => id !== playerId)
            };
          }
          return m;
        });
        return { ...r, matches: updatedMatches };
      }
      return r;
    });
    
    setRounds(updatedRounds);
  };

  const handleDrop = (roundId: string, matchId: string, team: 'teamA' | 'teamB', draggedPlayer: string) => {
    if (!draggedPlayer || !canEditResults) return;

    const round = rounds.find(r => r.id === roundId);
    if (!round) return;
    
    const match = round.matches.find(m => m.id === matchId);
    if (!match) return;

    const otherTeam = team === 'teamA' ? 'teamB' : 'teamA';
    const otherTeamPlayers = match[otherTeam];
    
    if (otherTeamPlayers.includes(draggedPlayer)) {
      return;
    }

    const updatedRounds = rounds.map(r => {
      if (r.id === roundId) {
        const updatedMatches = r.matches.map(m => {
          if (m.id === matchId) {
            const currentTeam = [...m[team]];
            if (!currentTeam.includes(draggedPlayer)) {
              currentTeam.push(draggedPlayer);
            }
            return { ...m, [team]: currentTeam };
          }
          return m;
        });
        return { ...r, matches: updatedMatches };
      }
      return r;
    });

    setRounds(updatedRounds);
    
    if (!isPresetGame && editingMatchId !== matchId) {
      setEditingMatchId(matchId);
    }
  };

  const updateSetResult = (roundId: string, matchId: string, setIndex: number, teamAScore: number, teamBScore: number) => {
    if (!canEditResults) return;

    const updatedRounds = rounds.map(r => {
      if (r.id === roundId) {
        const updatedMatches = r.matches.map(m => {
          if (m.id === matchId) {
            const newSets = [...m.sets];
            newSets[setIndex] = { teamA: teamAScore, teamB: teamBScore };

            if (teamAScore === 0 && teamBScore === 0 && newSets.length > 1) {
              newSets.splice(setIndex, 1);
            }

            // Only add a new set if singleSet is false
            if (!singleSet) {
              const lastSet = newSets[newSets.length - 1];
              if (!lastSet || (lastSet.teamA !== 0 || lastSet.teamB !== 0)) {
                newSets.push({ teamA: 0, teamB: 0 });
              }
            }

            return { ...m, sets: newSets };
          }
          return m;
        });
        return { ...r, matches: updatedMatches };
      }
      return r;
    });

    setRounds(updatedRounds);
  };

  const removeSet = (roundId: string, matchId: string, setIndex: number) => {
    if (!canEditResults) return;
    
    const updatedRounds = rounds.map(r => {
      if (r.id === roundId) {
        const updatedMatches = r.matches.map(m => {
          if (m.id === matchId && m.sets.length > 1) {
            const newSets = m.sets.filter((_, index) => index !== setIndex);
            return { ...m, sets: newSets };
          }
          return m;
        });
        return { ...r, matches: updatedMatches };
      }
      return r;
    });
    
    setRounds(updatedRounds);
  };

  const canEnterResults = (match: Match) => {
    return match.teamA.length > 0 && match.teamB.length > 0;
  };

  return {
    rounds,
    setRounds,
    expandedRoundId,
    setExpandedRoundId,
    editingMatchId,
    setEditingMatchId,
    isPresetGame,
    addRound,
    removeRound,
    addMatch,
    removeMatch,
    removePlayerFromTeam,
    handleDrop,
    updateSetResult,
    removeSet,
    canEnterResults,
  };
};

