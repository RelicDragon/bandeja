import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { GameType } from '@prisma/client';
import { calculateClassicGameOutcomes, calculateAmericanoGameOutcomes } from './calculator.service';

export async function generateGameOutcomes(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: {
        include: {
          user: true,
        },
        where: {
          isPlaying: true,
        },
      },
      rounds: {
        include: {
          matches: {
            include: {
              teams: {
                include: {
                  players: true,
                },
              },
              sets: true,
            },
          },
        },
        orderBy: {
          roundNumber: 'asc',
        },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const players = game.participants.map(p => ({
    userId: p.userId,
    level: p.user.level,
    reliability: p.user.reliability,
    gamesPlayed: p.user.gamesPlayed,
  }));

  const roundResults = game.rounds.map(round => ({
    matches: round.matches.map(match => {
      const teams = match.teams.map(team => {
        const totalScore = match.sets.reduce((sum, set) => {
          if (team.teamNumber === 1) return sum + set.teamAScore;
          if (team.teamNumber === 2) return sum + set.teamBScore;
          return sum;
        }, 0);

        return {
          teamId: team.id,
          score: totalScore,
          playerIds: team.players.map(p => p.userId),
        };
      });

      return {
        teams,
        winnerId: match.winnerId,
      };
    }),
  }));

  let result;
  
  if (game.gameType === GameType.AMERICANO || game.gameType === GameType.MEXICANO) {
    result = calculateAmericanoGameOutcomes(players, roundResults);
  } else {
    result = calculateClassicGameOutcomes(players, roundResults, game.gameType);
  }

  return {
    finalOutcomes: result.gameOutcomes,
    roundOutcomes: result.roundOutcomes,
  };
}

