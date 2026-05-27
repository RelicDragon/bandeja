import type { RoundData } from '@/api/results';
import type { Game } from '@/types';
import { winningTeamFromFinalGame } from '@/utils/leagueBracketOutcome';

export type LeagueGameCardWinner = {
  winner: 'teamA' | 'teamB' | null;
  isTie: boolean;
};

function winningTeamFromResultsRounds(allRounds: RoundData[]): 'teamA' | 'teamB' | null {
  let setsWonA = 0;
  let setsWonB = 0;
  for (const round of allRounds) {
    for (const match of round.matches ?? []) {
      for (const set of match.sets ?? []) {
        if (set.teamAScore === 0 && set.teamBScore === 0) continue;
        if (set.teamAScore > set.teamBScore) setsWonA += 1;
        else if (set.teamBScore > set.teamAScore) setsWonB += 1;
      }
    }
  }
  if (setsWonA > setsWonB) return 'teamA';
  if (setsWonB > setsWonA) return 'teamB';
  return null;
}

export function resolveLeagueGameCardWinner(
  game: Game,
  allRounds?: RoundData[] | null
): LeagueGameCardWinner {
  if (game.resultsStatus !== 'FINAL') {
    return { winner: null, isTie: false };
  }

  const fromOutcomes = winningTeamFromFinalGame(game);
  if (fromOutcomes) {
    return { winner: fromOutcomes, isTie: false };
  }

  if (allRounds?.length) {
    const fromScores = winningTeamFromResultsRounds(allRounds);
    if (fromScores) {
      return { winner: fromScores, isTie: false };
    }
  }

  if (game.outcomes?.length) {
    return { winner: null, isTie: true };
  }

  return { winner: null, isTie: false };
}
