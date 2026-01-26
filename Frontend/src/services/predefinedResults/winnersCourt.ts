import { createId } from '@paralleldrive/cuid2';
import { Match, Round } from '@/types/gameResults';
import { Game } from '@/types';

export function generateWinnersCourtRound(
  game: Game,
  previousRounds: Round[],
  initialSets: Array<{ teamA: number; teamB: number }>
): Match[] {
  const playingParticipants = game.participants.filter(p => p.isPlaying);
  const numPlayers = playingParticipants.length;
  
  if (numPlayers < 4) {
    return [];
  }
  
  const sortedCourts = game.gameCourts 
    ? [...game.gameCourts].sort((a, b) => a.order - b.order)
    : [];
  
  const numCourts = sortedCourts.length || 1;
  const numMatches = Math.min(numCourts, Math.floor(numPlayers / 4));

  if (previousRounds.length === 0) {
    const sortedPlayers = [...playingParticipants].sort((a, b) => b.user.level - a.user.level);
    const playerIds = sortedPlayers.map(p => p.userId);
    const matches: Match[] = [];
    
    for (let i = 0; i < numMatches; i++) {
      const baseIndex = i * 4;
      const player1 = playerIds[baseIndex];
      const player2 = playerIds[baseIndex + 1];
      const player3 = playerIds[baseIndex + 2];
      const player4 = playerIds[baseIndex + 3];
      
      if (player1 && player2 && player3 && player4) {
        matches.push({
          id: createId(),
          teamA: [player1, player3],
          teamB: [player2, player4],
          sets: initialSets,
          courtId: sortedCourts[i]?.courtId,
        });
      }
    }
    
    return matches;
  } else {
    const previousRound = previousRounds[previousRounds.length - 1];
    
    if (!previousRound.matches || previousRound.matches.length === 0) {
      return [];
    }

    const courtResults: Array<{
      courtIndex: number;
      winners: string[];
      losers: string[];
    }> = [];

    for (let i = 0; i < previousRound.matches.length; i++) {
      const match = previousRound.matches[i];
      
      const validSets = match.sets.filter(set => set.teamA > 0 || set.teamB > 0);
      const teamAScore = validSets.reduce((sum: number, set) => sum + set.teamA, 0);
      const teamBScore = validSets.reduce((sum: number, set) => sum + set.teamB, 0);
      
      let winners: string[] = [];
      let losers: string[] = [];
      
      if (teamAScore > teamBScore) {
        winners = [...match.teamA];
        losers = [...match.teamB];
      } else if (teamBScore > teamAScore) {
        winners = [...match.teamB];
        losers = [...match.teamA];
      } else {
        winners = [...match.teamA];
        losers = [...match.teamB];
      }
      
      courtResults.push({
        courtIndex: i,
        winners,
        losers
      });
    }

    const newMatches: Array<{
      courtIndex: number;
      teamA: string[];
      teamB: string[];
    }> = [];

    for (let i = 0; i < courtResults.length; i++) {
      const currentCourt = courtResults[i];
      
      if (i === 0) {
        if (courtResults.length > 1) {
          const nextCourtWinners = courtResults[1].winners;
          
          if (currentCourt.winners.length >= 2 && nextCourtWinners.length >= 2) {
            newMatches.push({
              courtIndex: i,
              teamA: [currentCourt.winners[0], nextCourtWinners[0]],
              teamB: [currentCourt.winners[1], nextCourtWinners[1]]
            });
          }
        } else {
          if (currentCourt.winners.length >= 2 && currentCourt.losers.length >= 2) {
            newMatches.push({
              courtIndex: i,
              teamA: [currentCourt.winners[0], currentCourt.losers[0]],
              teamB: [currentCourt.winners[1], currentCourt.losers[1]]
            });
          }
        }
      } else if (i === courtResults.length - 1) {
        if (currentCourt.losers.length >= 2 && currentCourt.winners.length >= 2) {
          newMatches.push({
            courtIndex: i,
            teamA: [currentCourt.losers[0], currentCourt.losers[1]],
            teamB: [currentCourt.winners[0], currentCourt.winners[1]]
          });
        }
      } else {
        const nextCourtWinners = courtResults[i + 1].winners;
        const prevCourtLosers = courtResults[i - 1].losers;
        
        if (prevCourtLosers.length >= 2 && currentCourt.winners.length >= 2) {
          newMatches.push({
            courtIndex: i,
            teamA: [prevCourtLosers[0], currentCourt.winners[0]],
            teamB: [prevCourtLosers[1], currentCourt.winners[1]]
          });
        }
        
        if (currentCourt.losers.length >= 2 && nextCourtWinners.length >= 2) {
          newMatches.push({
            courtIndex: i,
            teamA: [currentCourt.losers[0], nextCourtWinners[0]],
            teamB: [currentCourt.losers[1], nextCourtWinners[1]]
          });
        }
      }
    }

    const matches: Match[] = [];
    for (let i = 0; i < Math.min(newMatches.length, numMatches); i++) {
      const newMatch = newMatches[i];
      matches.push({
        id: createId(),
        teamA: newMatch.teamA,
        teamB: newMatch.teamB,
        sets: initialSets,
        courtId: sortedCourts[newMatch.courtIndex]?.courtId,
      });
    }
    
    return matches;
  }
}

