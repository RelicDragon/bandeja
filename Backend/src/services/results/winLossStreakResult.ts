import { WinnerOfGame } from '@prisma/client';

export type WinLossStreakResultInput = {
  winnerOfGame: WinnerOfGame;
  wins: number;
  losses: number;
  scoresMade: number;
  scoresLost: number;
  position: number | null;
  /** Highest persisted place in this game's leaderboard. */
  leaderboardLastPlace: number | null;
};

/**
 * Classify a finished game for profile win/loss streaks.
 *
 * This is deliberately separate from GameOutcome.isWinner. isWinner identifies
 * the event champion and is also used by podiums, bets, stories, and results UI.
 */
export function computeIsWinForStreak(input: WinLossStreakResultInput): boolean | null {
  switch (input.winnerOfGame) {
    case WinnerOfGame.BY_SCORES_DELTA:
      return input.scoresMade - input.scoresLost >= 0;
    case WinnerOfGame.BY_MATCHES_WON:
    case WinnerOfGame.PLAYOFF_FINALS:
      return input.wins - input.losses >= 0;
    case WinnerOfGame.BY_POINTS:
    case WinnerOfGame.BY_SCORES_MADE: {
      if (
        input.position == null ||
        input.position < 1 ||
        input.leaderboardLastPlace == null ||
        input.leaderboardLastPlace < 1
      ) {
        return null;
      }
      return input.position <= Math.ceil(input.leaderboardLastPlace / 2);
    }
    default:
      return null;
  }
}

export function findLeaderboardLastPlace(
  outcomes: Array<{ position?: number | null }>,
): number | null {
  let lastPlace: number | null = null;
  for (const outcome of outcomes) {
    const position = outcome.position;
    if (position == null || position < 1) continue;
    lastPlace = lastPlace == null ? position : Math.max(lastPlace, position);
  }
  return lastPlace;
}
