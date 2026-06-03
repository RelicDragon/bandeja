import { ScoringPreset, WinnerOfMatch } from '@prisma/client';
import { validateClassicRegularGames, validateMatchClassicSetScores } from './classicSetScoreValidation';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const classicGame = {
  scoringPreset: ScoringPreset.CLASSIC_BEST_OF_3,
  fixedNumberOfSets: 3,
  ballsInGames: true,
  winnerOfMatch: WinnerOfMatch.BY_SETS,
};

const fast4Game = {
  scoringPreset: ScoringPreset.CLASSIC_FAST4,
  fixedNumberOfSets: 3,
  ballsInGames: true,
  winnerOfMatch: WinnerOfMatch.BY_SETS,
};

assert(validateMatchClassicSetScores(classicGame, [{ teamA: 6, teamB: 4 }]) === null, 'bo3 6-4');
assert(validateMatchClassicSetScores(classicGame, [{ teamA: 7, teamB: 5, isTieBreak: true }]) === null, 'bo3 TB 7-5');

assert(validateMatchClassicSetScores(fast4Game, [{ teamA: 4, teamB: 2 }]) === null, 'FAST4 4-2');
assert(validateMatchClassicSetScores(fast4Game, [{ teamA: 4, teamB: 3 }]) === null, 'FAST4 4-3');
assert(
  validateMatchClassicSetScores(fast4Game, [{ teamA: 5, teamB: 3, isTieBreak: true }]) === null,
  'FAST4 TB 5-3',
);
assert(
  validateMatchClassicSetScores(fast4Game, [{ teamA: 5, teamB: 4, isTieBreak: true }]) !== null,
  'FAST4 TB rejects 5-4',
);

const fast4Rules = {
  gamesPerSet: 4,
  winBy: 2,
  tieBreakGameAtGames: 3,
  superTieBreakReplacesDeciderAtIndex: null,
  superTieBreakFirstTo: 10,
  superTieBreakWinBy: 2,
  tieBreakGameFirstTo: 5,
  tieBreakGameWinBy: 2,
};
assert(validateClassicRegularGames(3, 3, fast4Rules) === null, 'FAST4 3-3 triggers TB');
assert(validateClassicRegularGames(4, 2, fast4Rules) === null, 'FAST4 regular 4-2');
assert(
  validateMatchClassicSetScores(fast4Game, [{ teamA: 3, teamB: 3 }]) === null,
  'FAST4 3-3 enters tiebreak path',
);

const classicTimedGame = {
  scoringPreset: ScoringPreset.CLASSIC_TIMED,
  fixedNumberOfSets: 1,
  ballsInGames: true,
  winnerOfMatch: WinnerOfMatch.BY_SETS,
};
assert(
  validateMatchClassicSetScores(classicTimedGame, [{ teamA: 4, teamB: 3 }]) === null,
  'CLASSIC_TIMED_RELAXED allows incomplete games at buzzer',
);
assert(
  validateMatchClassicSetScores(classicGame, [{ teamA: 4, teamB: 3 }]) !== null,
  'strict classic rejects incomplete set',
);

const matchTimerClassic = {
  ...classicGame,
  matchTimerEnabled: true,
};
assert(
  validateMatchClassicSetScores(matchTimerClassic, [{ teamA: 5, teamB: 4 }]) === null,
  'matchTimerEnabled skips incomplete regular set validation',
);

console.log('ok: classicSetScoreValidation.test.ts');
