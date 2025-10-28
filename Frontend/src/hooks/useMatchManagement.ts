import { useState, useCallback, useEffect } from 'react';
import { Match } from '@/types/gameResults';
import { User } from '@/types';

interface UseMatchManagementProps {
  players: User[];
  hasResults: boolean;
  canEditResults: boolean;
  singleSet?: boolean;
}

export const useMatchManagement = ({ players, hasResults, canEditResults, singleSet = false }: UseMatchManagementProps) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  const isPresetGame = players.length === 2 || players.length === 4;

  const initializeMatches = useCallback(() => {
    if (players.length === 2) {
      setMatches([{
        id: 'match-1',
        teamA: [players[0].id],
        teamB: [players[1].id],
        sets: [{ teamA: 0, teamB: 0 }]
      }]);
    } else if (players.length === 4) {
      setMatches([
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
      ]);
    } else {
      setMatches([{
        id: 'match-1',
        teamA: [],
        teamB: [],
        sets: [{ teamA: 0, teamB: 0 }]
      }]);
    }
  }, [players]);

  useEffect(() => {
    if (!hasResults && canEditResults && players.length > 0) {
      initializeMatches();
    }
  }, [hasResults, canEditResults, players.length, initializeMatches]);

  const addMatch = () => {
    if (isPresetGame || !canEditResults) return;
    
    const newMatch: Match = {
      id: `match-${matches.length + 1}`,
      teamA: [],
      teamB: [],
      sets: [{ teamA: 0, teamB: 0 }]
    };
    setMatches([...matches, newMatch]);
    setEditingMatchId(newMatch.id);
  };

  const removeMatch = (matchId: string) => {
    if (matches.length > 1 && !isPresetGame && canEditResults) {
      const updatedMatches = matches.filter(m => m.id !== matchId);
      setMatches(updatedMatches);
      
      if (editingMatchId === matchId) {
        setEditingMatchId(updatedMatches[0]?.id || null);
      }
    }
  };

  const removePlayerFromTeam = (matchId: string, team: 'teamA' | 'teamB', playerId: string) => {
    if (!canEditResults) return;
    
    const updatedMatches = matches.map(m => {
      if (m.id === matchId) {
        return {
          ...m,
          [team]: m[team].filter(id => id !== playerId)
        };
      }
      return m;
    });
    setMatches(updatedMatches);
  };

  const handleDrop = (matchId: string, team: 'teamA' | 'teamB', draggedPlayer: string) => {
    if (!draggedPlayer || !canEditResults) return;

    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const otherTeam = team === 'teamA' ? 'teamB' : 'teamA';
    const otherTeamPlayers = match[otherTeam];
    
    if (otherTeamPlayers.includes(draggedPlayer)) {
      return;
    }

    const updatedMatches = matches.map(m => {
      if (m.id === matchId) {
        const currentTeam = [...m[team]];
        if (!currentTeam.includes(draggedPlayer)) {
          currentTeam.push(draggedPlayer);
        }
        return { ...m, [team]: currentTeam };
      }
      return m;
    });

    setMatches(updatedMatches);
    
    if (!isPresetGame && editingMatchId !== matchId) {
      setEditingMatchId(matchId);
    }
  };

  const updateSetResult = (matchId: string, setIndex: number, teamAScore: number, teamBScore: number) => {
    if (!canEditResults) return;

    const updatedMatches = matches.map(m => {
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
    setMatches(updatedMatches);
  };

  const removeSet = (matchId: string, setIndex: number) => {
    if (!canEditResults) return;
    
    const updatedMatches = matches.map(m => {
      if (m.id === matchId && m.sets.length > 1) {
        const newSets = m.sets.filter((_, index) => index !== setIndex);
        return { ...m, sets: newSets };
      }
      return m;
    });
    setMatches(updatedMatches);
  };

  const canEnterResults = (match: Match) => {
    return match.teamA.length > 0 && match.teamB.length > 0;
  };

  return {
    matches,
    setMatches,
    editingMatchId,
    setEditingMatchId,
    isPresetGame,
    addMatch,
    removeMatch,
    removePlayerFromTeam,
    handleDrop,
    updateSetResult,
    removeSet,
    canEnterResults,
  };
};

