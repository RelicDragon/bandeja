import { WinnerOfRound, Prisma } from '@prisma/client';

interface TeamScore {
  teamId: string;
  matchesWon: number;
  totalScores: number;
}

interface RoundWithMatches {
  id: string;
  matches: Array<{
    id: string;
    winnerId: string | null;
    teams: Array<{
      id: string;
      teamNumber: number;
    }>;
    sets: Array<{
      teamAScore: number;
      teamBScore: number;
    }>;
  }>;
}

function getTeamScoresForRound(round: RoundWithMatches): Map<string, TeamScore> {
  console.log(`[ROUND TEAM SCORES] Calculating team scores for round ${round.id} with ${round.matches.length} matches`);
  const teamScores = new Map<string, TeamScore>();

  for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
    const match = round.matches[matchIdx];
    console.log(`[ROUND TEAM SCORES] Processing match ${matchIdx + 1}/${round.matches.length} (${match.id})`);
    
    for (const team of match.teams) {
      if (!teamScores.has(team.id)) {
        teamScores.set(team.id, {
          teamId: team.id,
          matchesWon: 0,
          totalScores: 0,
        });
        console.log(`[ROUND TEAM SCORES] Initialized team ${team.id} (teamNumber: ${team.teamNumber})`);
      }
    }

    const teamA = match.teams.find(t => t.teamNumber === 1);
    const teamB = match.teams.find(t => t.teamNumber === 2);

    if (!teamA || !teamB) {
      console.log(`[ROUND TEAM SCORES] Skipping match ${match.id} - missing teams (A: ${teamA?.id}, B: ${teamB?.id})`);
      continue;
    }

    const teamAScore = match.sets.reduce((sum, set) => sum + set.teamAScore, 0);
    const teamBScore = match.sets.reduce((sum, set) => sum + set.teamBScore, 0);

    const scoreA = teamScores.get(teamA.id)!;
    const scoreB = teamScores.get(teamB.id)!;

    scoreA.totalScores += teamAScore;
    scoreB.totalScores += teamBScore;

    console.log(`[ROUND TEAM SCORES] Match ${match.id}: Team A (${teamA.id}) scored ${teamAScore}, Team B (${teamB.id}) scored ${teamBScore}`);
    console.log(`[ROUND TEAM SCORES] Match ${match.id}: winnerId = ${match.winnerId || 'null'}`);

    if (match.winnerId === teamA.id) {
      scoreA.matchesWon++;
      console.log(`[ROUND TEAM SCORES] Match ${match.id} won by Team A (${teamA.id})`);
    } else if (match.winnerId === teamB.id) {
      scoreB.matchesWon++;
      console.log(`[ROUND TEAM SCORES] Match ${match.id} won by Team B (${teamB.id})`);
    } else {
      console.log(`[ROUND TEAM SCORES] Match ${match.id} has no winner (tie or not determined)`);
    }
  }

  console.log(`[ROUND TEAM SCORES] Final team scores for round ${round.id}:`);
  for (const [teamId, score] of teamScores.entries()) {
    console.log(`[ROUND TEAM SCORES]   Team ${teamId}: matchesWon=${score.matchesWon}, totalScores=${score.totalScores}`);
  }

  return teamScores;
}

function calculateRoundWinnerByMatchesWon(round: RoundWithMatches): string[] {
  console.log(`[ROUND WINNER BY MATCHES] Calculating winner for round ${round.id}`);
  const teamScores = getTeamScoresForRound(round);
  
  if (teamScores.size === 0) {
    console.log(`[ROUND WINNER BY MATCHES] No teams found, returning empty array`);
    return [];
  }

  const sortedTeams = Array.from(teamScores.values()).sort((a, b) => {
    return b.matchesWon - a.matchesWon;
  });

  console.log(`[ROUND WINNER BY MATCHES] Teams sorted by matches won:`, sortedTeams.map(t => `Team ${t.teamId}: ${t.matchesWon} matches`).join(', '));

  const maxMatchesWon = sortedTeams[0].matchesWon;
  const winners = sortedTeams.filter(t => t.matchesWon === maxMatchesWon);

  console.log(`[ROUND WINNER BY MATCHES] Max matches won: ${maxMatchesWon}, Winners: ${winners.map(w => w.teamId).join(', ')}`);

  return winners.map(w => w.teamId);
}

function calculateRoundWinnerByScoresDelta(round: RoundWithMatches): string[] {
  console.log(`[ROUND WINNER BY SCORES] Calculating winner for round ${round.id}`);
  const teamScores = getTeamScoresForRound(round);
  
  if (teamScores.size === 0) {
    console.log(`[ROUND WINNER BY SCORES] No teams found, returning empty array`);
    return [];
  }

  const sortedTeams = Array.from(teamScores.values()).sort((a, b) => {
    return b.totalScores - a.totalScores;
  });

  console.log(`[ROUND WINNER BY SCORES] Teams sorted by total scores:`, sortedTeams.map(t => `Team ${t.teamId}: ${t.totalScores} points`).join(', '));

  const maxScores = sortedTeams[0].totalScores;
  const winners = sortedTeams.filter(t => t.totalScores === maxScores);

  console.log(`[ROUND WINNER BY SCORES] Max total scores: ${maxScores}, Winners: ${winners.map(w => w.teamId).join(', ')}`);

  return winners.map(w => w.teamId);
}

export function calculateRoundWinner(
  round: RoundWithMatches,
  winnerOfRound: WinnerOfRound
): string[] {
  console.log(`[ROUND WINNER] Calculating winner for round ${round.id} using method: ${winnerOfRound}`);
  const result = (() => {
    switch (winnerOfRound) {
      case WinnerOfRound.BY_MATCHES_WON:
        return calculateRoundWinnerByMatchesWon(round);
      
      case WinnerOfRound.BY_SCORES_DELTA:
        return calculateRoundWinnerByScoresDelta(round);
      
      default:
        return calculateRoundWinnerByMatchesWon(round);
    }
  })();
  console.log(`[ROUND WINNER] Final winners for round ${round.id}: ${result.length > 0 ? result.join(', ') : 'none'}`);
  return result;
}

interface PlayerScore {
  userId: string;
  matchesWon: number;
  totalScores: number;
}

async function getPlayerScoresForRound(
  roundId: string,
  tx: Prisma.TransactionClient
): Promise<Map<string, PlayerScore>> {
  console.log(`[ROUND PLAYER SCORES] Calculating player scores for round ${roundId}`);
  const round = await tx.round.findUnique({
    where: { id: roundId },
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
  });

  if (!round) {
    console.log(`[ROUND PLAYER SCORES] Round ${roundId} not found`);
    return new Map();
  }

  console.log(`[ROUND PLAYER SCORES] Round ${roundId} has ${round.matches.length} matches`);
  const playerScores = new Map<string, PlayerScore>();

  for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
    const match = round.matches[matchIdx];
    console.log(`[ROUND PLAYER SCORES] Processing match ${matchIdx + 1}/${round.matches.length} (${match.id})`);
    
    const teamA = match.teams.find(t => t.teamNumber === 1);
    const teamB = match.teams.find(t => t.teamNumber === 2);

    if (!teamA || !teamB) {
      console.log(`[ROUND PLAYER SCORES] Skipping match ${match.id} - missing teams`);
      continue;
    }

    for (const player of teamA.players) {
      if (!playerScores.has(player.userId)) {
        playerScores.set(player.userId, {
          userId: player.userId,
          matchesWon: 0,
          totalScores: 0,
        });
        console.log(`[ROUND PLAYER SCORES] Initialized player ${player.userId} (Team A)`);
      }
    }

    for (const player of teamB.players) {
      if (!playerScores.has(player.userId)) {
        playerScores.set(player.userId, {
          userId: player.userId,
          matchesWon: 0,
          totalScores: 0,
        });
        console.log(`[ROUND PLAYER SCORES] Initialized player ${player.userId} (Team B)`);
      }
    }

    const teamAScore = match.sets.reduce((sum, set) => sum + set.teamAScore, 0);
    const teamBScore = match.sets.reduce((sum, set) => sum + set.teamBScore, 0);

    console.log(`[ROUND PLAYER SCORES] Match ${match.id}: Team A scored ${teamAScore}, Team B scored ${teamBScore}, winnerId: ${match.winnerId || 'null'}`);

    for (const player of teamA.players) {
      const score = playerScores.get(player.userId)!;
      score.totalScores += teamAScore;
      if (match.winnerId === teamA.id) {
        score.matchesWon++;
        console.log(`[ROUND PLAYER SCORES] Player ${player.userId} (Team A) won match, matchesWon now: ${score.matchesWon}`);
      }
      console.log(`[ROUND PLAYER SCORES] Player ${player.userId} (Team A) totalScores now: ${score.totalScores}`);
    }

    for (const player of teamB.players) {
      const score = playerScores.get(player.userId)!;
      score.totalScores += teamBScore;
      if (match.winnerId === teamB.id) {
        score.matchesWon++;
        console.log(`[ROUND PLAYER SCORES] Player ${player.userId} (Team B) won match, matchesWon now: ${score.matchesWon}`);
      }
      console.log(`[ROUND PLAYER SCORES] Player ${player.userId} (Team B) totalScores now: ${score.totalScores}`);
    }
  }

  console.log(`[ROUND PLAYER SCORES] Final player scores for round ${roundId}:`);
  for (const [userId, score] of playerScores.entries()) {
    console.log(`[ROUND PLAYER SCORES]   Player ${userId}: matchesWon=${score.matchesWon}, totalScores=${score.totalScores}`);
  }

  return playerScores;
}

export async function updateRoundOutcomes(
  gameId: string,
  roundId: string,
  winnerOfRound: WinnerOfRound,
  tx: Prisma.TransactionClient
): Promise<void> {
  console.log(`[UPDATE ROUND OUTCOMES] Starting for game ${gameId}, round ${roundId}, winnerOfRound: ${winnerOfRound}`);
  const playerScores = await getPlayerScoresForRound(roundId, tx);

  const sortedPlayers = Array.from(playerScores.values()).sort((a, b) => {
    if (winnerOfRound === WinnerOfRound.BY_MATCHES_WON) {
      return b.matchesWon - a.matchesWon;
    } else {
      return b.totalScores - a.totalScores;
    }
  });

  console.log(`[UPDATE ROUND OUTCOMES] Players sorted by ${winnerOfRound === WinnerOfRound.BY_MATCHES_WON ? 'matchesWon' : 'totalScores'}:`, 
    sortedPlayers.map(p => `Player ${p.userId}: ${winnerOfRound === WinnerOfRound.BY_MATCHES_WON ? p.matchesWon : p.totalScores}`).join(', '));

  for (const playerScore of sortedPlayers) {
    console.log(`[UPDATE ROUND OUTCOMES] Upserting outcome for player ${playerScore.userId}: matchesWon=${playerScore.matchesWon}, totalScores=${playerScore.totalScores}`);
    await tx.roundOutcome.upsert({
      where: {
        roundId_userId: {
          roundId,
          userId: playerScore.userId,
        },
      },
      create: {
        roundId,
        userId: playerScore.userId,
        levelChange: 0,
        metadata: {
          matchesWon: playerScore.matchesWon,
          totalScores: playerScore.totalScores,
        },
      },
      update: {
        metadata: {
          matchesWon: playerScore.matchesWon,
          totalScores: playerScore.totalScores,
        },
      },
    });
  }
  console.log(`[UPDATE ROUND OUTCOMES] Completed for game ${gameId}, round ${roundId}`);
}

