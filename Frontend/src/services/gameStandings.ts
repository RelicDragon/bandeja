import { Game, User, WinnerOfGame } from '@/types';
import { Round, Match } from '@/types/gameResults';

export interface PlayerStanding {
  user: User;
  place: number;
  wins: number;
  ties: number;
  losses: number;
  scoresMade: number;
  scoresLost: number;
  points: number;
  roundsWon: number;
  matchesWon: number;
  scoresDelta: number;
}

interface PlayerStats {
  userId: string;
  wins: number;
  ties: number;
  losses: number;
  scoresMade: number;
  scoresLost: number;
  roundsWon: number;
  matchesWon: number;
  scoresDelta: number;
}

function calculateMatchWinner(match: Match): 'teamA' | 'teamB' | 'tie' | null {
  if (!match.sets || match.sets.length === 0) {
    return null;
  }

  if (match.winnerId) {
    return match.winnerId;
  }

  const totalScoreA = match.sets.reduce((sum, set) => sum + set.teamA, 0);
  const totalScoreB = match.sets.reduce((sum, set) => sum + set.teamB, 0);

  if (totalScoreA > totalScoreB) return 'teamA';
  if (totalScoreB > totalScoreA) return 'teamB';
  if (totalScoreA === totalScoreB && totalScoreA > 0) return 'tie';
  
  return null;
}

function calculatePlayerStats(
  playerId: string,
  rounds: Round[]
): PlayerStats {
  const stats: PlayerStats = {
    userId: playerId,
    wins: 0,
    ties: 0,
    losses: 0,
    scoresMade: 0,
    scoresLost: 0,
    roundsWon: 0,
    matchesWon: 0,
    scoresDelta: 0,
  };

  for (const round of rounds) {
    if (!round.matches || round.matches.length === 0) continue;

    for (const match of round.matches) {
      const isInTeamA = match.teamA.includes(playerId);
      const isInTeamB = match.teamB.includes(playerId);

      if (!isInTeamA && !isInTeamB) continue;

      const matchWinner = calculateMatchWinner(match);
      const totalScoreA = match.sets.reduce((sum, set) => sum + set.teamA, 0);
      const totalScoreB = match.sets.reduce((sum, set) => sum + set.teamB, 0);

      if (isInTeamA) {
        stats.scoresMade += totalScoreA;
        stats.scoresLost += totalScoreB;
        stats.scoresDelta += (totalScoreA - totalScoreB);

        if (matchWinner === 'teamA') {
          stats.wins++;
          stats.matchesWon++;
        } else if (matchWinner === 'teamB') {
          stats.losses++;
        } else if (matchWinner === 'tie') {
          stats.ties++;
        }
      } else if (isInTeamB) {
        stats.scoresMade += totalScoreB;
        stats.scoresLost += totalScoreA;
        stats.scoresDelta += (totalScoreB - totalScoreA);

        if (matchWinner === 'teamB') {
          stats.wins++;
          stats.matchesWon++;
        } else if (matchWinner === 'teamA') {
          stats.losses++;
        } else if (matchWinner === 'tie') {
          stats.ties++;
        }
      }
    }
  }

  return stats;
}

function getSortValue(
  stats: PlayerStats,
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number = 0,
  pointsPerTie: number = 0,
  pointsPerLoose: number = 0
): number {
  switch (winnerOfGame) {
    case 'BY_MATCHES_WON':
      return stats.matchesWon;
    case 'BY_POINTS':
      return stats.wins * pointsPerWin + stats.ties * pointsPerTie + stats.losses * pointsPerLoose;
    case 'BY_SCORES_DELTA':
      return stats.scoresDelta;
    case 'PLAYOFF_FINALS':
      return 0;
    default:
      return stats.matchesWon;
  }
}


export function calculateGameStandings(
  game: Game,
  rounds: Round[],
  winnerOfGame: WinnerOfGame
): PlayerStanding[] {
  const playingParticipants = game.participants.filter(p => p.isPlaying);
  const players = playingParticipants.map(p => p.user as User);

  if (players.length === 0 || rounds.length === 0) {
    return [];
  }

  const playerStatsMap = new Map<string, PlayerStats>();

  for (const player of players) {
    const stats = calculatePlayerStats(player.id, rounds);
    playerStatsMap.set(player.id, stats);
  }

  const pointsPerWin = game.pointsPerWin ?? 0;
  const pointsPerTie = game.pointsPerTie ?? 0;
  const pointsPerLoose = game.pointsPerLoose ?? 0;

  const standings: PlayerStanding[] = [];

  for (const player of players) {
    const stats = playerStatsMap.get(player.id);
    if (!stats) continue;

    const isPointsBased = winnerOfGame === 'BY_POINTS';
    const points = isPointsBased 
      ? stats.wins * pointsPerWin + stats.ties * pointsPerTie + stats.losses * pointsPerLoose
      : 0;

    standings.push({
      user: player,
      place: 0,
      wins: stats.wins,
      ties: stats.ties,
      losses: stats.losses,
      scoresMade: stats.scoresMade,
      scoresLost: stats.scoresLost,
      points,
      roundsWon: stats.roundsWon,
      matchesWon: stats.matchesWon,
      scoresDelta: stats.scoresDelta,
    });
  }

  standings.sort((a, b) => {
    const aValue = getSortValue(playerStatsMap.get(a.user.id)!, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose);
    const bValue = getSortValue(playerStatsMap.get(b.user.id)!, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose);
    return bValue - aValue;
  });

  let currentPlace = 1;
  for (let i = 0; i < standings.length; i++) {
    if (i > 0) {
      const prevValue = getSortValue(playerStatsMap.get(standings[i - 1].user.id)!, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose);
      const currentValue = getSortValue(playerStatsMap.get(standings[i].user.id)!, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose);
      
      if (prevValue !== currentValue) {
        currentPlace = i + 1;
      }
    }
    standings[i].place = currentPlace;
  }

  return standings;
}

