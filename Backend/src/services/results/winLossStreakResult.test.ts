import assert from 'node:assert/strict';
import { WinnerOfGame } from '@prisma/client';
import { computeIsWinForStreak } from './winLossStreakResult';

const matches = (wins: number, losses: number) =>
  computeIsWinForStreak({
    winnerOfGame: WinnerOfGame.BY_MATCHES_WON,
    wins,
    losses,
    scoresMade: 0,
    scoresLost: 0,
    position: null,
    leaderboardLastPlace: null,
  });

assert.equal(matches(2, 2), true, 'zero match delta is a streak win');
assert.equal(matches(0, 0), true, '0-0 is a streak win, not “must win a match”');
assert.equal(matches(1, 0), true, '1-0 is a streak win');
assert.equal(matches(1, 2), false, '1-2 is a streak loss; one match win is not enough');
assert.equal(matches(3, 4), false, 'winning some matches still loses when the delta is negative');

assert.equal(
  computeIsWinForStreak({
    winnerOfGame: WinnerOfGame.PLAYOFF_FINALS,
    wins: 1,
    losses: 2,
    scoresMade: 0,
    scoresLost: 0,
    position: null,
    leaderboardLastPlace: null,
  }),
  false,
  'playoff finals use the same match delta',
);

assert.equal(
  computeIsWinForStreak({
    winnerOfGame: WinnerOfGame.BY_SCORES_DELTA,
    wins: 1,
    losses: 2,
    scoresMade: 20,
    scoresLost: 20,
    position: null,
    leaderboardLastPlace: null,
  }),
  true,
  'ball delta is independent of match record',
);
