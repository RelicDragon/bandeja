import { Match } from '@/types/gameResults';
import { Game } from '@/types';
import { Round } from '@/types/gameResults';
import { createId } from '@paralleldrive/cuid2';
import { calculateGameStandings } from '../gameStandings';

export function generateRatingRound(
  game: Game,
  previousRounds: Round[],
  initialSets: Array<{ teamA: number; teamB: number }>
): Match[] {
  const playingParticipants = game.participants.filter(p => p.status === 'PLAYING');
  const numPlayers = playingParticipants.length;
  
  if (numPlayers < 4) {
    return [];
  }
  
  const numCourts = game.gameCourts?.length || 1;
  const numMatches = Math.min(numCourts, Math.floor(numPlayers / 4));
  
  const sortedCourts = game.gameCourts 
    ? [...game.gameCourts].sort((a, b) => a.order - b.order)
    : [];
  
  let playerIds: string[];
  
  if (previousRounds.length === 0) {
    playerIds = shuffleArray(playingParticipants.map(p => p.userId));
  } else {
    const standings = calculateGameStandings(game, previousRounds, game.winnerOfGame || 'BY_MATCHES_WON');
    playerIds = standings.map(s => s.user.id);
  }
  
  const actualMatches = Math.min(numMatches, Math.floor(playerIds.length / 4));
  const matches: Match[] = [];
  
  for (let i = 0; i < actualMatches; i++) {
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
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

