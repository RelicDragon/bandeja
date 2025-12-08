import { WinnerOfGame, Prisma } from '@prisma/client';

interface PlayerGameScore {
  userId: string;
  matchesWon: number;
  wins: number;
  ties: number;
  losses: number;
  totalPoints: number;
  scoresDelta: number;
}

function calculatePointsEarned(
  player: PlayerGameScore,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number
): number {
  return player.wins * pointsPerWin + player.ties * pointsPerTie + player.losses * pointsPerLoose;
}

function initializePlayerScore(userId: string): PlayerGameScore {
  return {
    userId,
    matchesWon: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    totalPoints: 0,
    scoresDelta: 0,
  };
}

function updatePlayerScore(
  gameScore: PlayerGameScore,
  teamScore: number,
  opponentScore: number,
  teamWon: boolean,
  isTie: boolean
): void {
  const delta = teamScore - opponentScore;
  gameScore.totalPoints += teamScore;
  gameScore.scoresDelta += delta;
  
  if (teamWon) {
    gameScore.matchesWon++;
    gameScore.wins++;
  } else if (isTie) {
    gameScore.ties++;
  } else {
    gameScore.losses++;
  }
}

function getSortKey(winnerOfGame: WinnerOfGame): string {
  switch (winnerOfGame) {
    case WinnerOfGame.BY_MATCHES_WON:
      return 'matchesWon';
    case WinnerOfGame.BY_POINTS:
      return 'totalPoints';
    case WinnerOfGame.BY_SCORES_DELTA:
      return 'scoresDelta';
    default:
      return 'matchesWon';
  }
}

function comparePlayers(
  a: PlayerGameScore,
  b: PlayerGameScore,
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number
): number {
  switch (winnerOfGame) {
    case WinnerOfGame.BY_MATCHES_WON:
      const matchesDiff = b.matchesWon - a.matchesWon;
      if (matchesDiff !== 0) return matchesDiff;
      return b.scoresDelta - a.scoresDelta;
    
    case WinnerOfGame.BY_POINTS:
      const aPointsEarned = calculatePointsEarned(a, pointsPerWin, pointsPerTie, pointsPerLoose);
      const bPointsEarned = calculatePointsEarned(b, pointsPerWin, pointsPerTie, pointsPerLoose);
      const pointsDiff = bPointsEarned - aPointsEarned;
      if (pointsDiff !== 0) return pointsDiff;
      return b.scoresDelta - a.scoresDelta;
    
    case WinnerOfGame.BY_SCORES_DELTA:
      const deltasDiff = b.scoresDelta - a.scoresDelta;
      if (deltasDiff !== 0) return deltasDiff;
      return b.matchesWon - a.matchesWon;
    
    case WinnerOfGame.PLAYOFF_FINALS:
      return 0;
    
    default:
      const defaultDiff = b.matchesWon - a.matchesWon;
      if (defaultDiff !== 0) return defaultDiff;
      return b.scoresDelta - a.scoresDelta;
  }
}

async function upsertGameOutcome(
  tx: Prisma.TransactionClient,
  gameId: string,
  playerScore: PlayerGameScore,
  position: number,
  isWinner: boolean,
  pointsEarned: number
): Promise<void> {
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
      position,
      isWinner,
      metadata: {
        wins: playerScore.wins,
        ties: playerScore.ties,
        losses: playerScore.losses,
        matchesWon: playerScore.matchesWon,
        totalPoints: playerScore.totalPoints,
        scoresDelta: playerScore.scoresDelta,
        pointsEarned,
      },
    },
    update: {
      position,
      isWinner,
      metadata: {
        wins: playerScore.wins,
        ties: playerScore.ties,
        losses: playerScore.losses,
        matchesWon: playerScore.matchesWon,
        totalPoints: playerScore.totalPoints,
        scoresDelta: playerScore.scoresDelta,
        pointsEarned,
      },
    },
  });
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

    for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
      const match = round.matches[matchIdx];
      console.log(`[GAME PLAYER SCORES] Processing match ${matchIdx + 1}/${round.matches.length} (${match.id})`);
      
      const teamA = match.teams.find(t => t.teamNumber === 1);
      const teamB = match.teams.find(t => t.teamNumber === 2);

      if (!teamA || !teamB) {
        console.log(`[GAME PLAYER SCORES] Skipping match ${match.id} - missing teams`);
        continue;
      }

      for (const player of [...teamA.players, ...teamB.players]) {
        if (!playerScores.has(player.userId)) {
          playerScores.set(player.userId, initializePlayerScore(player.userId));
          console.log(`[GAME PLAYER SCORES] Initialized player ${player.userId}`);
        }
      }

      const validSets = match.sets.filter(set => set.teamAScore > 0 || set.teamBScore > 0);
      if (validSets.length === 0) {
        console.log(`[GAME PLAYER SCORES] Skipping match ${match.id} - no valid sets (all sets are 0:0)`);
        continue;
      }
      
      const teamAScore = validSets.reduce((sum, set) => sum + set.teamAScore, 0);
      const teamBScore = validSets.reduce((sum, set) => sum + set.teamBScore, 0);

      console.log(`[GAME PLAYER SCORES] Match ${match.id}: Team A scored ${teamAScore}, Team B scored ${teamBScore}, winnerId: ${match.winnerId || 'null'}`);

      const teamAWon = match.winnerId === teamA.id;
      const teamBWon = match.winnerId === teamB.id;
      const isTie = !teamAWon && !teamBWon;

      for (const player of teamA.players) {
        const gameScore = playerScores.get(player.userId)!;
        updatePlayerScore(gameScore, teamAScore, teamBScore, teamAWon, isTie);
        const result = teamAWon ? 'won' : isTie ? 'tied' : 'lost';
        console.log(`[GAME PLAYER SCORES] Player ${player.userId} (Team A) ${result} match ${match.id}`);
        console.log(`[GAME PLAYER SCORES] Player ${player.userId} (Team A): wins=${gameScore.wins}, ties=${gameScore.ties}, losses=${gameScore.losses}, totalPoints=${gameScore.totalPoints}, scoresDelta=${gameScore.scoresDelta}`);
      }

      for (const player of teamB.players) {
        const gameScore = playerScores.get(player.userId)!;
        updatePlayerScore(gameScore, teamBScore, teamAScore, teamBWon, isTie);
        const result = teamBWon ? 'won' : isTie ? 'tied' : 'lost';
        console.log(`[GAME PLAYER SCORES] Player ${player.userId} (Team B) ${result} match ${match.id}`);
        console.log(`[GAME PLAYER SCORES] Player ${player.userId} (Team B): wins=${gameScore.wins}, ties=${gameScore.ties}, losses=${gameScore.losses}, totalPoints=${gameScore.totalPoints}, scoresDelta=${gameScore.scoresDelta}`);
      }
    }
  }

  console.log(`[GAME PLAYER SCORES] Final game scores for game ${gameId}:`);
  for (const [userId, score] of playerScores.entries()) {
    console.log(`[GAME PLAYER SCORES]   Player ${userId}: matchesWon=${score.matchesWon}, totalPoints=${score.totalPoints}, scoresDelta=${score.scoresDelta}`);
  }

  return playerScores;
}

function determineGameWinners(
  playerScores: Map<string, PlayerGameScore>,
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number = 0,
  pointsPerTie: number = 0,
  pointsPerLoose: number = 0
): string[] {
  console.log(`[DETERMINE GAME WINNERS] Starting with winnerOfGame: ${winnerOfGame}`);
  
  if (playerScores.size === 0) {
    console.log(`[DETERMINE GAME WINNERS] No player scores, returning empty array`);
    return [];
  }

  const sortKey = getSortKey(winnerOfGame);
  const sortedPlayers = Array.from(playerScores.values()).sort((a, b) => 
    comparePlayers(a, b, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose)
  );

  console.log(`[DETERMINE GAME WINNERS] Players sorted by ${sortKey}:`, sortedPlayers.map(p => 
    `Player ${p.userId}: ${sortKey}=${p[sortKey as keyof PlayerGameScore]}`
  ).join(', '));

  const topValue = (() => {
    switch (winnerOfGame) {
      case WinnerOfGame.BY_MATCHES_WON:
        return sortedPlayers[0].matchesWon;
      case WinnerOfGame.BY_POINTS:
        return calculatePointsEarned(sortedPlayers[0], pointsPerWin, pointsPerTie, pointsPerLoose);
      case WinnerOfGame.BY_SCORES_DELTA:
        return sortedPlayers[0].scoresDelta;
      default:
        return sortedPlayers[0].matchesWon;
    }
  })();

  console.log(`[DETERMINE GAME WINNERS] Top ${sortKey} value: ${topValue}`);

  const winners = sortedPlayers.filter(p => {
    switch (winnerOfGame) {
      case WinnerOfGame.BY_MATCHES_WON:
        return p.matchesWon === topValue;
      case WinnerOfGame.BY_POINTS:
        return calculatePointsEarned(p, pointsPerWin, pointsPerTie, pointsPerLoose) === topValue;
      case WinnerOfGame.BY_SCORES_DELTA:
        return p.scoresDelta === topValue;
      default:
        return p.matchesWon === topValue;
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

  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: { pointsPerWin: true, pointsPerTie: true, pointsPerLoose: true },
  });

  const playerScores = await getPlayerGameScores(gameId, tx);
  const winners = determineGameWinners(
    playerScores, 
    winnerOfGame,
    game?.pointsPerWin || 0,
    game?.pointsPerTie || 0,
    game?.pointsPerLoose || 0
  );
  console.log(`[CALCULATE GAME WINNER] Final winners for game ${gameId}: ${winners.length > 0 ? winners.join(', ') : 'none'}`);
  return winners;
}

export async function updateGameOutcomes(
  gameId: string,
  winnerOfGame: WinnerOfGame,
  tx: Prisma.TransactionClient
): Promise<void> {
  console.log(`[UPDATE GAME OUTCOMES] Starting for game ${gameId}, winnerOfGame: ${winnerOfGame}`);
  
  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: { 
      pointsPerWin: true, 
      pointsPerTie: true, 
      pointsPerLoose: true,
      hasFixedTeams: true,
      genderTeams: true,
    },
  });

  const pointsPerWin = game?.pointsPerWin || 0;
  const pointsPerTie = game?.pointsPerTie || 0;
  const pointsPerLoose = game?.pointsPerLoose || 0;
  const isMixPairsWithoutFixedTeams = !game?.hasFixedTeams && game?.genderTeams === 'MIX_PAIRS';

  const playerScores = await getPlayerGameScores(gameId, tx);
  if (playerScores.size === 0) {
    console.log(`[UPDATE GAME OUTCOMES] No player scores found for game ${gameId}, skipping update`);
    return;
  }
  const winners = determineGameWinners(playerScores, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose);

  const sortPlayers = (players: PlayerGameScore[]) => {
    return [...players].sort((a, b) => 
      comparePlayers(a, b, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose)
    );
  };

  const arePlayersTied = (a: PlayerGameScore, b: PlayerGameScore): boolean => {
    return (
      a.wins === b.wins &&
      a.ties === b.ties &&
      a.losses === b.losses &&
      a.matchesWon === b.matchesWon &&
      a.scoresDelta === b.scoresDelta &&
      calculatePointsEarned(a, pointsPerWin, pointsPerTie, pointsPerLoose) === 
      calculatePointsEarned(b, pointsPerWin, pointsPerTie, pointsPerLoose)
    );
  };

  const assignPositionsWithTies = (sortedPlayers: PlayerGameScore[]): Map<string, number> => {
    const positionMap = new Map<string, number>();
    let currentPosition = 1;
    let i = 0;

    while (i < sortedPlayers.length) {
      const tiedGroup: PlayerGameScore[] = [sortedPlayers[i]];
      let j = i + 1;

      while (j < sortedPlayers.length && arePlayersTied(sortedPlayers[i], sortedPlayers[j])) {
        tiedGroup.push(sortedPlayers[j]);
        j++;
      }

      for (const player of tiedGroup) {
        positionMap.set(player.userId, currentPosition);
      }

      currentPosition += 1;
      i = j;
    }

    return positionMap;
  };

  let winnerUserIds: Set<string> = new Set(winners);
  let playerPositionMap: Map<string, number> | null = null;
  let sortedPlayers: PlayerGameScore[];
  
  if (isMixPairsWithoutFixedTeams) {
    const userIds = Array.from(playerScores.keys());
    const users = await tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, gender: true },
    });
    
    const userGenderMap = new Map(users.map(u => [u.id, u.gender]));
    const allPlayers = Array.from(playerScores.values());
    
    const malePlayers = sortPlayers(allPlayers.filter(p => userGenderMap.get(p.userId) === 'MALE'));
    const femalePlayers = sortPlayers(allPlayers.filter(p => userGenderMap.get(p.userId) === 'FEMALE'));
    
    const malePositionMap = assignPositionsWithTies(malePlayers);
    const femalePositionMap = assignPositionsWithTies(femalePlayers);
    
    for (const player of malePlayers) {
      if (malePositionMap.get(player.userId) === 1) {
        winnerUserIds.add(player.userId);
      }
    }
    for (const player of femalePlayers) {
      if (femalePositionMap.get(player.userId) === 1) {
        winnerUserIds.add(player.userId);
      }
    }
    
    console.log(`[UPDATE GAME OUTCOMES] MIX_PAIRS mode: Male winners: ${malePlayers.filter(p => malePositionMap.get(p.userId) === 1).map(p => p.userId).join(', ')}, Female winners: ${femalePlayers.filter(p => femalePositionMap.get(p.userId) === 1).map(p => p.userId).join(', ')}`);
    
    const maxPairs = Math.max(malePlayers.length, femalePlayers.length);
    playerPositionMap = new Map<string, number>();
    
    for (let i = 0; i < maxPairs; i++) {
      if (i < malePlayers.length) {
        const position = malePositionMap.get(malePlayers[i].userId);
        if (position !== undefined) {
          playerPositionMap.set(malePlayers[i].userId, position);
        }
      }
      if (i < femalePlayers.length) {
        const position = femalePositionMap.get(femalePlayers[i].userId);
        if (position !== undefined) {
          playerPositionMap.set(femalePlayers[i].userId, position);
        }
      }
    }
    
    sortedPlayers = [];
    for (let i = 0; i < maxPairs; i++) {
      if (i < malePlayers.length) {
        sortedPlayers.push(malePlayers[i]);
      }
      if (i < femalePlayers.length) {
        sortedPlayers.push(femalePlayers[i]);
      }
    }
    console.log(`[UPDATE GAME OUTCOMES] MIX_PAIRS mode: Assigning positions in pairs`);
  } else {
    sortedPlayers = sortPlayers(Array.from(playerScores.values()));
  }

  if (isMixPairsWithoutFixedTeams && playerPositionMap) {
    for (const playerScore of sortedPlayers) {
      const position = playerPositionMap.get(playerScore.userId);
      if (position === undefined) {
        console.log(`[UPDATE GAME OUTCOMES] Warning: Position not found for player ${playerScore.userId} in MIX_PAIRS mode, skipping`);
        continue;
      }
      const isWinner = winnerUserIds.has(playerScore.userId);
      const pointsEarned = calculatePointsEarned(playerScore, pointsPerWin, pointsPerTie, pointsPerLoose);
      console.log(`[UPDATE GAME OUTCOMES] Position ${position}: Player ${playerScore.userId} (isWinner=${isWinner}), wins=${playerScore.wins}, ties=${playerScore.ties}, losses=${playerScore.losses}, pointsEarned=${pointsEarned}, matchesWon=${playerScore.matchesWon}, totalPoints=${playerScore.totalPoints}, scoresDelta=${playerScore.scoresDelta}`);

      await upsertGameOutcome(tx, gameId, playerScore, position, isWinner, pointsEarned);
    }
  } else {
    const sortKey = getSortKey(winnerOfGame);
    const positionMap = assignPositionsWithTies(sortedPlayers);
    console.log(`[UPDATE GAME OUTCOMES] Players sorted by ${sortKey} for positions:`);
    for (const playerScore of sortedPlayers) {
      const position = positionMap.get(playerScore.userId) ?? sortedPlayers.length;
      const isWinner = winnerUserIds.has(playerScore.userId);
      const pointsEarned = calculatePointsEarned(playerScore, pointsPerWin, pointsPerTie, pointsPerLoose);
      console.log(`[UPDATE GAME OUTCOMES] Position ${position}: Player ${playerScore.userId} (isWinner=${isWinner}), wins=${playerScore.wins}, ties=${playerScore.ties}, losses=${playerScore.losses}, pointsEarned=${pointsEarned}, matchesWon=${playerScore.matchesWon}, totalPoints=${playerScore.totalPoints}, scoresDelta=${playerScore.scoresDelta}`);

      await upsertGameOutcome(tx, gameId, playerScore, position, isWinner, pointsEarned);
    }
  }
  console.log(`[UPDATE GAME OUTCOMES] Completed for game ${gameId}`);
}

