import {
  isBracketRoundStartGame,
  leagueRoundStartNotificationBodyPrefix,
  leagueRoundStartNotificationTitleKey,
  leagueRoundStartViewButtonKey,
} from './leagueRoundStartNotificationCopy.util';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const bracketGame = {
  leagueSeason: { league: { name: 'Summer League' } },
  leagueRound: { orderIndex: 2, playoffFormat: 'BRACKET' },
};

const sessionGame = {
  leagueSeason: { league: { name: 'Summer League' } },
  leagueRound: { orderIndex: 1, playoffFormat: 'SESSION' },
};

assert(isBracketRoundStartGame(bracketGame), 'bracket round detected');
assert(!isBracketRoundStartGame(sessionGame), 'session round not bracket');

assert(
  leagueRoundStartNotificationTitleKey(bracketGame) === 'telegram.leagueBracketRoundStartReceived',
  'bracket title key'
);
assert(
  leagueRoundStartNotificationTitleKey(sessionGame) === 'telegram.leagueRoundStartReceived',
  'session title key'
);

assert(
  leagueRoundStartViewButtonKey(bracketGame) === 'telegram.viewBracket',
  'bracket view button'
);
assert(
  leagueRoundStartViewButtonKey(sessionGame) === 'telegram.viewGame',
  'session view button'
);

const bracketBody = leagueRoundStartNotificationBodyPrefix(bracketGame, 'en');
assert(bracketBody.includes('Summer League'), 'bracket body includes league');
assert(bracketBody.includes('Playoff bracket'), 'bracket body frames bracket');
assert(bracketBody.includes('Round 3'), 'bracket body includes round number');

const sessionBody = leagueRoundStartNotificationBodyPrefix(sessionGame, 'en');
assert(sessionBody.includes('Summer League - Round 2'), 'session body unchanged shape');

console.log('ok: leagueRoundStartNotificationCopy.util.test.ts');
