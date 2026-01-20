import { WinnerOfGame, WinnerOfMatch, Prisma } from '@prisma/client';

interface PlayerGameScore {
  userId: string;
  matchesWon: number;
  wins: number;
  ties: number;
  losses: number;
  totalPoints: number;
  scoresDelta: number;
  level: number;
}

function calculatePointsEarned(
  player: PlayerGameScore,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number
): number {
  return player.wins * pointsPerWin + player.ties * pointsPerTie + player.losses * pointsPerLoose;
}

function initializePlayerScore(userId: string, level: number): PlayerGameScore {
  return {
    userId,
    matchesWon: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    totalPoints: 0,
    scoresDelta: 0,
    level,
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
  pointsPerLoose: number,
  h2hResult: 'A' | 'B' | 'tie' | null = null
): number {
  switch (winnerOfGame) {
    case WinnerOfGame.BY_MATCHES_WON:
      const matchesDiff = b.matchesWon - a.matchesWon;
      if (matchesDiff !== 0) return matchesDiff;
      
      const tiesDiff = b.ties - a.ties;
      if (tiesDiff !== 0) return tiesDiff;
      
      const scoresDeltaDiff = b.scoresDelta - a.scoresDelta;
      if (scoresDeltaDiff !== 0) return scoresDeltaDiff;
      
      if (h2hResult === 'A') return -1;
      if (h2hResult === 'B') return 1;
      
      return a.level - b.level;
    
    case WinnerOfGame.BY_POINTS:
      const aPointsEarned = calculatePointsEarned(a, pointsPerWin, pointsPerTie, pointsPerLoose);
      const bPointsEarned = calculatePointsEarned(b, pointsPerWin, pointsPerTie, pointsPerLoose);
      const pointsDiff = bPointsEarned - aPointsEarned;
      if (pointsDiff !== 0) return pointsDiff;
      
      const matchesDiff2 = b.matchesWon - a.matchesWon;
      if (matchesDiff2 !== 0) return matchesDiff2;
      
      const tiesDiff2 = b.ties - a.ties;
      if (tiesDiff2 !== 0) return tiesDiff2;
      
      const scoresDeltaDiff2 = b.scoresDelta - a.scoresDelta;
      if (scoresDeltaDiff2 !== 0) return scoresDeltaDiff2;
      
      if (h2hResult === 'A') return -1;
      if (h2hResult === 'B') return 1;
      
      return a.level - b.level;
    
    case WinnerOfGame.BY_SCORES_DELTA:
      const deltasDiff = b.scoresDelta - a.scoresDelta;
      if (deltasDiff !== 0) return deltasDiff;
      
      const matchesDiff3 = b.matchesWon - a.matchesWon;
      if (matchesDiff3 !== 0) return matchesDiff3;
      
      const tiesDiff3 = b.ties - a.ties;
      if (tiesDiff3 !== 0) return tiesDiff3;
      
      if (h2hResult === 'A') return -1;
      if (h2hResult === 'B') return 1;
      
      return a.level - b.level;
    
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
                  players: {
                    include: {
                      user: {
                        select: { id: true, level: true },
                      },
                    },
                  },
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

  // First pass: initialize all players with their levels
  for (const round of game.rounds) {
    for (const match of round.matches) {
      for (const team of match.teams) {
        for (const player of team.players) {
          if (!playerScores.has(player.userId)) {
            const userLevel = player.user?.level ?? 1;
            playerScores.set(
              player.userId,
              initializePlayerScore(player.userId, userLevel)
            );
            console.log(`[GAME PLAYER SCORES] Initialized player ${player.userId} with level ${userLevel}`);
          }
        }
      }
    }
  }

  // Second pass: calculate scores
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

function calculateHeadToHeadMap(
  game: {
    rounds: Array<{
      matches: Array<{
        teams: Array<{
          id: string;
          teamNumber: number;
          players: Array<{ userId: string }>;
        }>;
        sets: Array<{ teamAScore: number; teamBScore: number }>;
        winnerId: string | null;
      }>;
    }>;
    winnerOfMatch: WinnerOfMatch;
  }
): Map<string, Map<string, 'A' | 'B' | 'tie' | null>> {
  const h2hMap = new Map<string, Map<string, 'A' | 'B' | 'tie' | null>>();
  const allPlayerIds = new Set<string>();

  // Collect all player IDs
  for (const round of game.rounds) {
    for (const match of round.matches) {
      for (const team of match.teams) {
        for (const player of team.players) {
          allPlayerIds.add(player.userId);
        }
      }
    }
  }

  const playerIdsArray = Array.from(allPlayerIds);

  // Calculate head-to-head for each pair
  for (let i = 0; i < playerIdsArray.length; i++) {
    for (let j = i + 1; j < playerIdsArray.length; j++) {
      const playerAId = playerIdsArray[i];
      const playerBId = playerIdsArray[j];
      
      let aWins = 0;
      let bWins = 0;

      for (const round of game.rounds) {
        for (const match of round.matches) {
          const validSets = match.sets.filter(set => set.teamAScore > 0 || set.teamBScore > 0);
          if (validSets.length === 0) continue;

          const teamA = match.teams.find(t => t.teamNumber === 1);
          const teamB = match.teams.find(t => t.teamNumber === 2);
          if (!teamA || !teamB) continue;

          const aInTeamA = teamA.players.some(p => p.userId === playerAId);
          const aInTeamB = teamB.players.some(p => p.userId === playerAId);
          const bInTeamA = teamA.players.some(p => p.userId === playerBId);
          const bInTeamB = teamB.players.some(p => p.userId === playerBId);

          const areOpponents = (aInTeamA && bInTeamB) || (aInTeamB && bInTeamA);
          if (!areOpponents) continue;

          // Determine match winner based on winnerOfMatch
          let matchWinner: 'teamA' | 'teamB' | 'tie' | null = null;
          
          if (match.winnerId) {
            if (match.winnerId === teamA.id) {
              matchWinner = 'teamA';
            } else if (match.winnerId === teamB.id) {
              matchWinner = 'teamB';
            }
          } else {
            if (game.winnerOfMatch === WinnerOfMatch.BY_SETS) {
              let teamASetsWon = 0;
              let teamBSetsWon = 0;
              for (const set of validSets) {
                if (set.teamAScore > set.teamBScore) teamASetsWon++;
                else if (set.teamBScore > set.teamAScore) teamBSetsWon++;
              }
              if (teamASetsWon > teamBSetsWon) matchWinner = 'teamA';
              else if (teamBSetsWon > teamASetsWon) matchWinner = 'teamB';
              else if (teamASetsWon === teamBSetsWon && teamASetsWon > 0) matchWinner = 'tie';
            } else {
              const teamAScore = validSets.reduce((sum, set) => sum + set.teamAScore, 0);
              const teamBScore = validSets.reduce((sum, set) => sum + set.teamBScore, 0);
              if (teamAScore > teamBScore) matchWinner = 'teamA';
              else if (teamBScore > teamAScore) matchWinner = 'teamB';
              else if (teamAScore === teamBScore && teamAScore > 0) matchWinner = 'tie';
            }
          }

          if (matchWinner === 'teamA') {
            if (aInTeamA) aWins++;
            else bWins++;
          } else if (matchWinner === 'teamB') {
            if (aInTeamB) aWins++;
            else bWins++;
          }
        }
      }

      let result: 'A' | 'B' | 'tie' | null = null;
      if (aWins > bWins) result = 'A';
      else if (bWins > aWins) result = 'B';
      else if (aWins === bWins && aWins > 0) result = 'tie';

      if (!h2hMap.has(playerAId)) {
        h2hMap.set(playerAId, new Map());
      }
      if (!h2hMap.has(playerBId)) {
        h2hMap.set(playerBId, new Map());
      }
      
      h2hMap.get(playerAId)!.set(playerBId, result);
      const reverseResult = result === 'A' ? 'B' : result === 'B' ? 'A' : result;
      h2hMap.get(playerBId)!.set(playerAId, reverseResult);
    }
  }

  return h2hMap;
}

function determineGameWinners(
  playerScores: Map<string, PlayerGameScore>,
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number = 0,
  pointsPerTie: number = 0,
  pointsPerLoose: number = 0,
  h2hMap?: Map<string, Map<string, 'A' | 'B' | 'tie' | null>>
): string[] {
  console.log(`[DETERMINE GAME WINNERS] Starting with winnerOfGame: ${winnerOfGame}`);
  
  if (playerScores.size === 0) {
    console.log(`[DETERMINE GAME WINNERS] No player scores, returning empty array`);
    return [];
  }

  const sortKey = getSortKey(winnerOfGame);
  const sortedPlayers = Array.from(playerScores.values()).sort((a, b) => {
    const h2hResult = h2hMap?.get(a.userId)?.get(b.userId) || null;
    return comparePlayers(a, b, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose, h2hResult);
  });

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
    console.log(`[CALCULATE GAME WINNER] Game ${gameId} not found`);
    return [];
  }

  const playerScores = await getPlayerGameScores(gameId, tx);
  
  // Calculate head-to-head map
  const h2hMap = calculateHeadToHeadMap({
    rounds: game.rounds,
    winnerOfMatch: game.winnerOfMatch || WinnerOfMatch.BY_SCORES,
  });

  const winners = determineGameWinners(
    playerScores, 
    winnerOfGame,
    game.pointsPerWin || 0,
    game.pointsPerTie || 0,
    game.pointsPerLoose || 0,
    h2hMap
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
      fixedTeams: {
        include: {
          players: {
            include: {
              user: {
                select: { id: true },
              },
            },
          },
        },
        orderBy: { teamNumber: 'asc' },
      },
    },
  });

  if (!game) {
    console.log(`[UPDATE GAME OUTCOMES] Game ${gameId} not found`);
    return;
  }

  const pointsPerWin = game.pointsPerWin || 0;
  const pointsPerTie = game.pointsPerTie || 0;
  const pointsPerLoose = game.pointsPerLoose || 0;
  const isMixPairsWithoutFixedTeams = !game.hasFixedTeams && game.genderTeams === 'MIX_PAIRS';

  const playerScores = await getPlayerGameScores(gameId, tx);
  if (playerScores.size === 0) {
    console.log(`[UPDATE GAME OUTCOMES] No player scores found for game ${gameId}, skipping update`);
    return;
  }

  // Calculate head-to-head map
  const h2hMap = calculateHeadToHeadMap({
    rounds: game.rounds,
    winnerOfMatch: game.winnerOfMatch || WinnerOfMatch.BY_SCORES,
  });

  const winners = determineGameWinners(playerScores, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose, h2hMap);

  const sortPlayers = (players: PlayerGameScore[]) => {
    return [...players].sort((a, b) => {
      const h2hResult = h2hMap.get(a.userId)?.get(b.userId) || null;
      return comparePlayers(a, b, winnerOfGame, pointsPerWin, pointsPerTie, pointsPerLoose, h2hResult);
    });
  };

  const arePlayersTied = (
    a: PlayerGameScore,
    b: PlayerGameScore,
    h2hMap: Map<string, Map<string, 'A' | 'B' | 'tie' | null>>
  ): boolean => {
    // Check all stats are equal
    if (
      a.wins !== b.wins ||
      a.ties !== b.ties ||
      a.losses !== b.losses ||
      a.matchesWon !== b.matchesWon ||
      a.scoresDelta !== b.scoresDelta
    ) {
      return false;
    }

    // Check points earned (only for BY_POINTS mode)
    if (winnerOfGame === WinnerOfGame.BY_POINTS) {
      const aPointsEarned = calculatePointsEarned(a, pointsPerWin, pointsPerTie, pointsPerLoose);
      const bPointsEarned = calculatePointsEarned(b, pointsPerWin, pointsPerTie, pointsPerLoose);
      if (aPointsEarned !== bPointsEarned) {
        return false;
      }
    }

    // Check head-to-head
    const h2h = h2hMap.get(a.userId)?.get(b.userId);
    if (h2h !== null && h2h !== 'tie' && h2h !== undefined) {
      return false;
    }

    // Check level
    if (a.level !== b.level) {
      return false;
    }

    return true;
  };

  const assignPositionsWithTies = (sortedPlayers: PlayerGameScore[]): Map<string, number> => {
    const positionMap = new Map<string, number>();
    let currentPosition = 1;
    let i = 0;

    while (i < sortedPlayers.length) {
      const tiedGroup: PlayerGameScore[] = [sortedPlayers[i]];
      let j = i + 1;

      while (j < sortedPlayers.length && arePlayersTied(sortedPlayers[i], sortedPlayers[j], h2hMap)) {
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

  interface TeamScore {
    teamId: string;
    teamNumber: number;
    playerIds: string[];
    matchesWon: number;
    wins: number;
    ties: number;
    losses: number;
    totalPoints: number;
    scoresDelta: number;
    pointsEarned: number;
  }

  const compareTeams = (a: TeamScore, b: TeamScore): number => {
    switch (winnerOfGame) {
      case WinnerOfGame.BY_MATCHES_WON:
        const matchesDiff = b.matchesWon - a.matchesWon;
        if (matchesDiff !== 0) return matchesDiff;
        
        const tiesDiff = b.ties - a.ties;
        if (tiesDiff !== 0) return tiesDiff;
        
        const scoresDeltaDiff = b.scoresDelta - a.scoresDelta;
        if (scoresDeltaDiff !== 0) return scoresDeltaDiff;
        
        return 0;
      
      case WinnerOfGame.BY_POINTS:
        const pointsDiff = b.pointsEarned - a.pointsEarned;
        if (pointsDiff !== 0) return pointsDiff;
        
        const matchesDiff2 = b.matchesWon - a.matchesWon;
        if (matchesDiff2 !== 0) return matchesDiff2;
        
        const tiesDiff2 = b.ties - a.ties;
        if (tiesDiff2 !== 0) return tiesDiff2;
        
        const scoresDeltaDiff2 = b.scoresDelta - a.scoresDelta;
        if (scoresDeltaDiff2 !== 0) return scoresDeltaDiff2;
        
        return 0;
      
      case WinnerOfGame.BY_SCORES_DELTA:
        const deltasDiff = b.scoresDelta - a.scoresDelta;
        if (deltasDiff !== 0) return deltasDiff;
        
        const matchesDiff3 = b.matchesWon - a.matchesWon;
        if (matchesDiff3 !== 0) return matchesDiff3;
        
        const tiesDiff3 = b.ties - a.ties;
        if (tiesDiff3 !== 0) return tiesDiff3;
        
        return 0;
      
      default:
        const defaultDiff = b.matchesWon - a.matchesWon;
        if (defaultDiff !== 0) return defaultDiff;
        return b.scoresDelta - a.scoresDelta;
    }
  };

  const areTeamsTied = (a: TeamScore, b: TeamScore): boolean => {
    if (
      a.wins !== b.wins ||
      a.ties !== b.ties ||
      a.losses !== b.losses ||
      a.matchesWon !== b.matchesWon ||
      a.scoresDelta !== b.scoresDelta
    ) {
      return false;
    }

    if (winnerOfGame === WinnerOfGame.BY_POINTS) {
      if (a.pointsEarned !== b.pointsEarned) {
        return false;
      }
    }

    return true;
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
  } else if (game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length > 0) {
    console.log(`[UPDATE GAME OUTCOMES] Fixed teams mode: Grouping players by fixed teams`);
    
    const teamScoresMap = new Map<string, TeamScore>();
    
    for (const fixedTeam of game.fixedTeams) {
      const teamPlayerIds = fixedTeam.players.map(p => p.userId);
      const teamPlayerScores = teamPlayerIds
        .map(userId => playerScores.get(userId))
        .filter((score): score is PlayerGameScore => score !== undefined);
      
      if (teamPlayerScores.length === 0) {
        console.warn(`[UPDATE GAME OUTCOMES] Team ${fixedTeam.id} (teamNumber: ${fixedTeam.teamNumber}) has no players with scores, skipping`);
        continue;
      }
      
      if (teamPlayerScores.length < teamPlayerIds.length) {
        const missingPlayers = teamPlayerIds.filter(id => !playerScores.has(id));
        console.warn(`[UPDATE GAME OUTCOMES] Team ${fixedTeam.id} (teamNumber: ${fixedTeam.teamNumber}) has ${teamPlayerScores.length}/${teamPlayerIds.length} players with scores. Missing players: ${missingPlayers.join(', ')}`);
      }
      
      const teamScore: TeamScore = {
        teamId: fixedTeam.id,
        teamNumber: fixedTeam.teamNumber,
        playerIds: teamPlayerIds,
        matchesWon: Math.max(...teamPlayerScores.map(p => p.matchesWon)),
        wins: Math.max(...teamPlayerScores.map(p => p.wins)),
        ties: Math.max(...teamPlayerScores.map(p => p.ties)),
        losses: Math.max(...teamPlayerScores.map(p => p.losses)),
        totalPoints: teamPlayerScores.reduce((sum, p) => sum + p.totalPoints, 0),
        scoresDelta: teamPlayerScores.reduce((sum, p) => sum + p.scoresDelta, 0),
        pointsEarned: teamPlayerScores.reduce((sum, p) => sum + calculatePointsEarned(p, pointsPerWin, pointsPerTie, pointsPerLoose), 0),
      };
      
      teamScoresMap.set(fixedTeam.id, teamScore);
    }
    
    const sortedTeams = Array.from(teamScoresMap.values()).sort(compareTeams);
    
    const teamPositionMap = new Map<string, number>();
    let currentPosition = 1;
    let i = 0;
    
    while (i < sortedTeams.length) {
      const tiedGroup: TeamScore[] = [sortedTeams[i]];
      let j = i + 1;
      
      while (j < sortedTeams.length && areTeamsTied(sortedTeams[i], sortedTeams[j])) {
        tiedGroup.push(sortedTeams[j]);
        j++;
      }
      
      for (const team of tiedGroup) {
        teamPositionMap.set(team.teamId, currentPosition);
      }
      
      currentPosition += 1;
      i = j;
    }
    
    playerPositionMap = new Map<string, number>();
    sortedPlayers = [];
    
    for (const team of sortedTeams) {
      const position = teamPositionMap.get(team.teamId) ?? sortedTeams.length;
      
      for (const playerId of team.playerIds) {
        const playerScore = playerScores.get(playerId);
        if (playerScore) {
          playerPositionMap.set(playerId, position);
          sortedPlayers.push(playerScore);
        } else {
          console.warn(`[UPDATE GAME OUTCOMES] Player ${playerId} in team ${team.teamId} (teamNumber: ${team.teamNumber}) has no score, cannot assign position`);
        }
      }
      
      if (position === 1) {
        for (const playerId of team.playerIds) {
          if (playerScores.has(playerId)) {
            winnerUserIds.add(playerId);
          }
        }
      }
    }
    
    console.log(`[UPDATE GAME OUTCOMES] Fixed teams mode: Assigned positions to ${playerPositionMap.size} players across ${sortedTeams.length} teams`);
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
  } else if (game.hasFixedTeams && playerPositionMap) {
    for (const playerScore of sortedPlayers) {
      const position = playerPositionMap.get(playerScore.userId);
      if (position === undefined) {
        console.log(`[UPDATE GAME OUTCOMES] Warning: Position not found for player ${playerScore.userId} in fixed teams mode, skipping`);
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

