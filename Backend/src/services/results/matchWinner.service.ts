import { WinnerOfMatch, Prisma } from '@prisma/client';

interface MatchWithTeamsAndSets {
  id: string;
  teams: Array<{
    id: string;
    teamNumber: number;
  }>;
  sets: Array<{
    teamAScore: number;
    teamBScore: number;
  }>;
}

function calculateMatchWinnerByScores(match: MatchWithTeamsAndSets): string | null {
  console.log(`[MATCH WINNER BY SCORES] Starting calculation for match ${match.id}`);
  console.log(`[MATCH WINNER BY SCORES] Match has ${match.sets.length} sets`);
  
  const validSets = match.sets.filter(set => set.teamAScore > 0 || set.teamBScore > 0);
  if (validSets.length === 0) {
    console.log(`[MATCH WINNER BY SCORES] No valid sets found, returning null`);
    return null;
  }

  const teamA = match.teams.find(t => t.teamNumber === 1);
  const teamB = match.teams.find(t => t.teamNumber === 2);

  if (!teamA || !teamB) {
    console.log(`[MATCH WINNER BY SCORES] Missing teams - teamA: ${teamA?.id}, teamB: ${teamB?.id}, returning null`);
    return null;
  }

  console.log(`[MATCH WINNER BY SCORES] Team A: ${teamA.id}, Team B: ${teamB.id}`);

  const teamAScore = validSets.reduce((sum, set) => sum + set.teamAScore, 0);
  const teamBScore = validSets.reduce((sum, set) => sum + set.teamBScore, 0);

  console.log(`[MATCH WINNER BY SCORES] Set scores:`, match.sets.map((s, i) => `Set ${i + 1}: A=${s.teamAScore}, B=${s.teamBScore}`).join(', '));
  console.log(`[MATCH WINNER BY SCORES] Total scores - Team A: ${teamAScore}, Team B: ${teamBScore}`);

  if (teamAScore > teamBScore) {
    console.log(`[MATCH WINNER BY SCORES] Winner: Team A (${teamA.id}) - ${teamAScore} > ${teamBScore}`);
    return teamA.id;
  } else if (teamBScore > teamAScore) {
    console.log(`[MATCH WINNER BY SCORES] Winner: Team B (${teamB.id}) - ${teamBScore} > ${teamAScore}`);
    return teamB.id;
  }

  console.log(`[MATCH WINNER BY SCORES] Tie - scores equal (${teamAScore} = ${teamBScore}), returning null`);
  return null;
}

function calculateMatchWinnerBySets(match: MatchWithTeamsAndSets): string | null {
  console.log(`[MATCH WINNER BY SETS] Starting calculation for match ${match.id}`);
  console.log(`[MATCH WINNER BY SETS] Match has ${match.sets.length} sets`);
  
  const validSets = match.sets.filter(set => set.teamAScore > 0 || set.teamBScore > 0);
  if (validSets.length === 0) {
    console.log(`[MATCH WINNER BY SETS] No valid sets found, returning null`);
    return null;
  }

  const teamA = match.teams.find(t => t.teamNumber === 1);
  const teamB = match.teams.find(t => t.teamNumber === 2);

  if (!teamA || !teamB) {
    console.log(`[MATCH WINNER BY SETS] Missing teams - teamA: ${teamA?.id}, teamB: ${teamB?.id}, returning null`);
    return null;
  }

  console.log(`[MATCH WINNER BY SETS] Team A: ${teamA.id}, Team B: ${teamB.id}`);

  let teamASetsWon = 0;
  let teamBSetsWon = 0;
  for (let i = 0; i < validSets.length; i++) {
    const set = validSets[i];
    console.log(`[MATCH WINNER BY SETS] Set ${i + 1}: A=${set.teamAScore}, B=${set.teamBScore}`);
    if (set.teamAScore > set.teamBScore) {
      teamASetsWon++;
      console.log(`[MATCH WINNER BY SETS] Set ${i + 1} won by Team A`);
    } else if (set.teamBScore > set.teamAScore) {
      teamBSetsWon++;
      console.log(`[MATCH WINNER BY SETS] Set ${i + 1} won by Team B`);
    } else {
      console.log(`[MATCH WINNER BY SETS] Set ${i + 1} is a tie`);
    }
  }

  console.log(`[MATCH WINNER BY SETS] Sets won - Team A: ${teamASetsWon}, Team B: ${teamBSetsWon}`);

  if (teamASetsWon > teamBSetsWon) {
    console.log(`[MATCH WINNER BY SETS] Winner: Team A (${teamA.id}) - ${teamASetsWon} > ${teamBSetsWon} sets`);
    return teamA.id;
  } else if (teamBSetsWon > teamASetsWon) {
    console.log(`[MATCH WINNER BY SETS] Winner: Team B (${teamB.id}) - ${teamBSetsWon} > ${teamASetsWon} sets`);
    return teamB.id;
  }

  console.log(`[MATCH WINNER BY SETS] Tie - sets won equal (${teamASetsWon} = ${teamBSetsWon}), returning null`);
  return null;
}

export function calculateMatchWinner(
  match: MatchWithTeamsAndSets,
  winnerOfMatch: WinnerOfMatch
): string | null {
  console.log(`[MATCH WINNER] Calculating winner for match ${match.id} using method: ${winnerOfMatch}`);
  const result = (() => {
    switch (winnerOfMatch) {
      case WinnerOfMatch.BY_SETS:
        return calculateMatchWinnerBySets(match);
      
      case WinnerOfMatch.BY_SCORES:
      default:
        return calculateMatchWinnerByScores(match);
    }
  })();
  console.log(`[MATCH WINNER] Final result for match ${match.id}: ${result || 'null (tie/no winner)'}`);
  return result;
}

export async function updateMatchWinners(
  gameId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  console.log(`[UPDATE MATCH WINNERS] Starting for game ${gameId}`);
  const game = await tx.game.findUnique({
    where: { id: gameId },
    include: {
      rounds: {
        include: {
          matches: {
            include: {
              teams: true,
              sets: true,
            },
          },
        },
      },
    },
  });

  if (!game) {
    console.log(`[UPDATE MATCH WINNERS] Game ${gameId} not found`);
    return;
  }

  console.log(`[UPDATE MATCH WINNERS] Game ${gameId} has ${game.rounds.length} rounds, winnerOfMatch: ${game.winnerOfMatch}`);

  for (const round of game.rounds) {
    console.log(`[UPDATE MATCH WINNERS] Processing round ${round.id} with ${round.matches.length} matches`);
    for (const match of round.matches) {
      const winnerId = calculateMatchWinner(match, game.winnerOfMatch);

      console.log(`[UPDATE MATCH WINNERS] Updating match ${match.id} with winnerId: ${winnerId || 'null'}`);
      await tx.match.update({
        where: { id: match.id },
        data: { winnerId },
      });
    }
  }
  console.log(`[UPDATE MATCH WINNERS] Completed for game ${gameId}`);
}

