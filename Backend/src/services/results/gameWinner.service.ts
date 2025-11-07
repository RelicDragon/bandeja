import { WinnerOfGame, Prisma } from '@prisma/client';

interface PlayerGameScore {
  userId: string;
  roundsWon: number;
  matchesWon: number;
  totalPoints: number;
  scoresDelta: number;
}

interface GameWithRounds {
  id: string;
  rounds: Array<{
    id: string;
    matches: Array<{
      id: string;
      winnerId: string | null;
      teams: Array<{
        id: string;
        teamNumber: number;
        players: Array<{
          userId: string;
        }>;
      }>;
      sets: Array<{
        teamAScore: number;
        teamBScore: number;
      }>;
    }>;
  }>;
}

async function getPlayerGameScores(
  gameId: string,
  tx: Prisma.TransactionClient
): Promise<Map<string, PlayerGameScore>> {
  console.log(`[GAME PLAYER SCORES] Starting calculation for game ${gameId}`);
  const game = await tx.game.findUnique({
    where: { id: gameId },
    include: {
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
      },
    },
  });

  if (!game) {
    console.log(`[GAME PLAYER SCORES] Game ${gameId} not found`);
    return new Map();
  }

  console.log(`[GAME PLAYER SCORES] Game ${gameId} has ${game.rounds.length} rounds`);
  const playerScores = new Map<string, PlayerGameScore>();

  for (let roundIdx = 0; roundIdx < game.rounds.length; roundIdx++) {
    const round = game.rounds[roundIdx];
    console.log(`[GAME PLAYER SCORES] Processing round ${roundIdx + 1}/${game.rounds.length} (${round.id}) with ${round.matches.length} matches`);
    const roundPlayerScores = new Map<string, { matchesWon: number; totalScores: number; scoresDelta: number }>();

    for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
      const match = round.matches[matchIdx];
      console.log(`[GAME PLAYER SCORES] Processing match ${matchIdx + 1}/${round.matches.length} (${match.id})`);
      
      const teamA = match.teams.find(t => t.teamNumber === 1);
      const teamB = match.teams.find(t => t.teamNumber === 2);

      if (!teamA || !teamB) {
        console.log(`[GAME PLAYER SCORES] Skipping match ${match.id} - missing teams`);
        continue;
      }

      for (const player of teamA.players) {
        if (!playerScores.has(player.userId)) {
          playerScores.set(player.userId, {
            userId: player.userId,
            roundsWon: 0,
            matchesWon: 0,
            totalPoints: 0,
            scoresDelta: 0,
          });
          console.log(`[GAME PLAYER SCORES] Initialized player ${player.userId} (Team A)`);
        }
        if (!roundPlayerScores.has(player.userId)) {
          roundPlayerScores.set(player.userId, {
            matchesWon: 0,
            totalScores: 0,
            scoresDelta: 0,
          });
        }
      }

      for (const player of teamB.players) {
        if (!playerScores.has(player.userId)) {
          playerScores.set(player.userId, {
            userId: player.userId,
            roundsWon: 0,
            matchesWon: 0,
            totalPoints: 0,
            scoresDelta: 0,
          });
          console.log(`[GAME PLAYER SCORES] Initialized player ${player.userId} (Team B)`);
        }
        if (!roundPlayerScores.has(player.userId)) {
          roundPlayerScores.set(player.userId, {
            matchesWon: 0,
            totalScores: 0,
            scoresDelta: 0,
          });
        }
      }

      const teamAScore = match.sets.reduce((sum, set) => sum + set.teamAScore, 0);
      const teamBScore = match.sets.reduce((sum, set) => sum + set.teamBScore, 0);

      console.log(`[GAME PLAYER SCORES] Match ${match.id}: Team A scored ${teamAScore}, Team B scored ${teamBScore}, winnerId: ${match.winnerId || 'null'}`);

      for (const player of teamA.players) {
        const gameScore = playerScores.get(player.userId)!;
        const roundScore = roundPlayerScores.get(player.userId)!;
        
        const delta = teamAScore - teamBScore;
        gameScore.totalPoints += teamAScore;
        roundScore.totalScores += teamAScore;
        gameScore.scoresDelta += delta;
        roundScore.scoresDelta += delta;
        
        if (match.winnerId === teamA.id) {
          gameScore.matchesWon++;
          roundScore.matchesWon++;
          console.log(`[GAME PLAYER SCORES] Player ${player.userId} (Team A) won match ${match.id}`);
        }
        console.log(`[GAME PLAYER SCORES] Player ${player.userId} (Team A): totalPoints=${gameScore.totalPoints}, scoresDelta=${gameScore.scoresDelta}, matchesWon=${gameScore.matchesWon}, roundDelta=${roundScore.scoresDelta}`);
      }

      for (const player of teamB.players) {
        const gameScore = playerScores.get(player.userId)!;
        const roundScore = roundPlayerScores.get(player.userId)!;
        
        const delta = teamBScore - teamAScore;
        gameScore.totalPoints += teamBScore;
        roundScore.totalScores += teamBScore;
        gameScore.scoresDelta += delta;
        roundScore.scoresDelta += delta;
        
        if (match.winnerId === teamB.id) {
          gameScore.matchesWon++;
          roundScore.matchesWon++;
          console.log(`[GAME PLAYER SCORES] Player ${player.userId} (Team B) won match ${match.id}`);
        }
        console.log(`[GAME PLAYER SCORES] Player ${player.userId} (Team B): totalPoints=${gameScore.totalPoints}, scoresDelta=${gameScore.scoresDelta}, matchesWon=${gameScore.matchesWon}, roundDelta=${roundScore.scoresDelta}`);
      }
    }

    const roundScoresArray = Array.from(roundPlayerScores.entries());
    if (roundScoresArray.length === 0) {
      console.log(`[GAME PLAYER SCORES] Round ${round.id} has no player scores, skipping round winner calculation`);
      continue;
    }

    console.log(`[GAME PLAYER SCORES] Round ${round.id} player scores:`, roundScoresArray.map(([userId, score]) => 
      `Player ${userId}: matchesWon=${score.matchesWon}, totalScores=${score.totalScores}, scoresDelta=${score.scoresDelta}`
    ).join(', '));

    const maxMatchesWon = Math.max(...roundScoresArray.map(([_, score]) => score.matchesWon));
    const roundWinners = roundScoresArray.filter(([_, score]) => score.matchesWon === maxMatchesWon);

    console.log(`[GAME PLAYER SCORES] Round ${round.id} max matches won: ${maxMatchesWon}, round winners: ${roundWinners.map(([userId]) => userId).join(', ')}`);

    for (const [userId, _] of roundWinners) {
      const gameScore = playerScores.get(userId)!;
      gameScore.roundsWon++;
      console.log(`[GAME PLAYER SCORES] Player ${userId} won round ${round.id}, roundsWon now: ${gameScore.roundsWon}`);
    }
  }

  console.log(`[GAME PLAYER SCORES] Final game scores for game ${gameId}:`);
  for (const [userId, score] of playerScores.entries()) {
    console.log(`[GAME PLAYER SCORES]   Player ${userId}: roundsWon=${score.roundsWon}, matchesWon=${score.matchesWon}, totalPoints=${score.totalPoints}, scoresDelta=${score.scoresDelta}`);
  }

  return playerScores;
}

function determineGameWinners(
  playerScores: Map<string, PlayerGameScore>,
  winnerOfGame: WinnerOfGame
): string[] {
  console.log(`[DETERMINE GAME WINNERS] Starting with winnerOfGame: ${winnerOfGame}`);
  
  if (playerScores.size === 0) {
    console.log(`[DETERMINE GAME WINNERS] No player scores, returning empty array`);
    return [];
  }

  const sortKey = (() => {
    switch (winnerOfGame) {
      case WinnerOfGame.BY_ROUNDS_WON:
        return 'roundsWon';
      case WinnerOfGame.BY_MATCHES_WON:
        return 'matchesWon';
      case WinnerOfGame.BY_POINTS:
        return 'totalPoints';
      case WinnerOfGame.BY_SCORES_DELTA:
        return 'scoresDelta';
      default:
        return 'roundsWon';
    }
  })();

  const sortedPlayers = Array.from(playerScores.values()).sort((a, b) => {
    switch (winnerOfGame) {
      case WinnerOfGame.BY_ROUNDS_WON:
        return b.roundsWon - a.roundsWon;
      
      case WinnerOfGame.BY_MATCHES_WON:
        return b.matchesWon - a.matchesWon;
      
      case WinnerOfGame.BY_POINTS:
        return b.totalPoints - a.totalPoints;
      
      case WinnerOfGame.BY_SCORES_DELTA:
        return b.scoresDelta - a.scoresDelta;
      
      case WinnerOfGame.PLAYOFF_FINALS:
        return 0;
      
      default:
        return b.roundsWon - a.roundsWon;
    }
  });

  console.log(`[DETERMINE GAME WINNERS] Players sorted by ${sortKey}:`, sortedPlayers.map(p => 
    `Player ${p.userId}: ${sortKey}=${p[sortKey as keyof PlayerGameScore]}`
  ).join(', '));

  const topValue = (() => {
    switch (winnerOfGame) {
      case WinnerOfGame.BY_ROUNDS_WON:
        return sortedPlayers[0].roundsWon;
      case WinnerOfGame.BY_MATCHES_WON:
        return sortedPlayers[0].matchesWon;
      case WinnerOfGame.BY_POINTS:
        return sortedPlayers[0].totalPoints;
      case WinnerOfGame.BY_SCORES_DELTA:
        return sortedPlayers[0].scoresDelta;
      default:
        return sortedPlayers[0].roundsWon;
    }
  })();

  console.log(`[DETERMINE GAME WINNERS] Top ${sortKey} value: ${topValue}`);

  const winners = sortedPlayers.filter(p => {
    switch (winnerOfGame) {
      case WinnerOfGame.BY_ROUNDS_WON:
        return p.roundsWon === topValue;
      case WinnerOfGame.BY_MATCHES_WON:
        return p.matchesWon === topValue;
      case WinnerOfGame.BY_POINTS:
        return p.totalPoints === topValue;
      case WinnerOfGame.BY_SCORES_DELTA:
        return p.scoresDelta === topValue;
      default:
        return p.roundsWon === topValue;
    }
  });

  console.log(`[DETERMINE GAME WINNERS] Winners (${winners.length}): ${winners.map(w => w.userId).join(', ')}`);

  return winners.map(w => w.userId);
}

export async function calculateGameWinner(
  gameId: string,
  winnerOfGame: WinnerOfGame,
  tx: Prisma.TransactionClient
): Promise<string[]> {
  console.log(`[CALCULATE GAME WINNER] Starting for game ${gameId}, winnerOfGame: ${winnerOfGame}`);
  
  if (winnerOfGame === WinnerOfGame.PLAYOFF_FINALS) {
    console.log(`[CALCULATE GAME WINNER] PLAYOFF_FINALS mode, returning empty array`);
    return [];
  }

  const playerScores = await getPlayerGameScores(gameId, tx);
  const winners = determineGameWinners(playerScores, winnerOfGame);
  console.log(`[CALCULATE GAME WINNER] Final winners for game ${gameId}: ${winners.length > 0 ? winners.join(', ') : 'none'}`);
  return winners;
}

export async function updateGameOutcomes(
  gameId: string,
  winnerOfGame: WinnerOfGame,
  tx: Prisma.TransactionClient
): Promise<void> {
  console.log(`[UPDATE GAME OUTCOMES] Starting for game ${gameId}, winnerOfGame: ${winnerOfGame}`);
  const playerScores = await getPlayerGameScores(gameId, tx);
  const winners = determineGameWinners(playerScores, winnerOfGame);

  const sortKey = (() => {
    switch (winnerOfGame) {
      case WinnerOfGame.BY_ROUNDS_WON:
        return 'roundsWon';
      case WinnerOfGame.BY_MATCHES_WON:
        return 'matchesWon';
      case WinnerOfGame.BY_POINTS:
        return 'totalPoints';
      case WinnerOfGame.BY_SCORES_DELTA:
        return 'scoresDelta';
      default:
        return 'roundsWon';
    }
  })();

  const sortedPlayers = Array.from(playerScores.values()).sort((a, b) => {
    switch (winnerOfGame) {
      case WinnerOfGame.BY_ROUNDS_WON:
        return b.roundsWon - a.roundsWon;
      case WinnerOfGame.BY_MATCHES_WON:
        return b.matchesWon - a.matchesWon;
      case WinnerOfGame.BY_POINTS:
        return b.totalPoints - a.totalPoints;
      case WinnerOfGame.BY_SCORES_DELTA:
        return b.scoresDelta - a.scoresDelta;
      default:
        return b.roundsWon - a.roundsWon;
    }
  });

  console.log(`[UPDATE GAME OUTCOMES] Players sorted by ${sortKey} for positions:`);
  for (let i = 0; i < sortedPlayers.length; i++) {
    const playerScore = sortedPlayers[i];
    const isWinner = winners.includes(playerScore.userId);
    console.log(`[UPDATE GAME OUTCOMES] Position ${i + 1}: Player ${playerScore.userId} (isWinner=${isWinner}), ${sortKey}=${playerScore[sortKey as keyof PlayerGameScore]}, roundsWon=${playerScore.roundsWon}, matchesWon=${playerScore.matchesWon}, totalPoints=${playerScore.totalPoints}, scoresDelta=${playerScore.scoresDelta}`);

    await tx.gameOutcome.upsert({
      where: {
        gameId_userId: {
          gameId,
          userId: playerScore.userId,
        },
      },
      create: {
        gameId,
        userId: playerScore.userId,
        levelBefore: 0,
        levelAfter: 0,
        levelChange: 0,
        reliabilityBefore: 0,
        reliabilityAfter: 0,
        reliabilityChange: 0,
        pointsEarned: 0,
        position: i + 1,
        isWinner,
        metadata: {
          roundsWon: playerScore.roundsWon,
          matchesWon: playerScore.matchesWon,
          totalPoints: playerScore.totalPoints,
          scoresDelta: playerScore.scoresDelta,
        },
      },
      update: {
        position: i + 1,
        isWinner,
        metadata: {
          roundsWon: playerScore.roundsWon,
          matchesWon: playerScore.matchesWon,
          totalPoints: playerScore.totalPoints,
          scoresDelta: playerScore.scoresDelta,
        },
      },
    });
  }
  console.log(`[UPDATE GAME OUTCOMES] Completed for game ${gameId}`);
}

