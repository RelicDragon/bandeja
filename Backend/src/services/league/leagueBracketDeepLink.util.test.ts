import {
  buildLeagueBracketSchedulePath,
  buildLeagueRoundStartViewUrl,
  leagueBracketPushScheduleExtras,
  leagueRoundStartPushScheduleExtras,
} from './leagueBracketDeepLink.util';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(
  buildLeagueBracketSchedulePath({
    bracketScope: 'PER_GROUP',
    leagueGroupId: 'g1',
  }) === 'tab=schedule&subtab=bracket&group=g1',
  'PER_GROUP includes group query'
);

assert(
  buildLeagueBracketSchedulePath({
    bracketScope: 'CROSS_GROUP',
    leagueGroupId: 'g1',
  }) === 'tab=schedule&subtab=bracket',
  'CROSS_GROUP omits group query'
);

assert(
  buildLeagueBracketSchedulePath({
    bracketScope: 'PER_GROUP',
    leagueGroupId: 'g1',
    roundId: 'round-1',
  }) === 'tab=schedule&subtab=bracket&roundId=round-1&round=round-1&group=g1',
  'roundId and round aliases included with group'
);

const sessionUrl = buildLeagueRoundStartViewUrl({
  id: 'game-1',
  parentId: 'season-1',
  leagueRound: { playoffFormat: 'SESSION' },
});
assert(sessionUrl.includes('/games/game-1'), 'non-bracket round links to game');
assert(!sessionUrl.includes('subtab=bracket'), 'non-bracket omits bracket subtab');

const bracketUrl = buildLeagueRoundStartViewUrl({
  id: 'game-1',
  parentId: 'season-1',
  leagueGroupId: 'grp-a',
  leagueRound: { id: 'round-bracket', playoffFormat: 'BRACKET', bracketScope: 'PER_GROUP' },
});
assert(bracketUrl.includes('/games/season-1?'), 'bracket round links to season');
assert(bracketUrl.includes('subtab=bracket'), 'bracket round includes bracket subtab');
assert(bracketUrl.includes('group=grp-a'), 'PER_GROUP bracket includes group');
assert(bracketUrl.includes('roundId=round-bracket'), 'bracket round includes roundId');

const pushExtras = leagueRoundStartPushScheduleExtras({
  id: 'g1',
  parentId: 's1',
  leagueGroupId: null,
  leagueRound: { id: 'r1', playoffFormat: 'BRACKET', bracketScope: 'CROSS_GROUP' },
});
assert(
  JSON.stringify(pushExtras) ===
    JSON.stringify({ leagueSeasonId: 's1', scheduleSubtab: 'bracket', scheduleRoundId: 'r1' }),
  'push extras for cross-group omit scheduleGroup but include roundId'
);

const assignedExtras = leagueBracketPushScheduleExtras({
  id: 'game-x',
  parentId: 'season-2',
  leagueGroupId: 'grp-b',
  leagueRound: { id: 'round-2', playoffFormat: 'BRACKET', bracketScope: 'PER_GROUP' },
});
assert(
  JSON.stringify(assignedExtras) ===
    JSON.stringify({
      leagueSeasonId: 'season-2',
      scheduleSubtab: 'bracket',
      scheduleGroup: 'grp-b',
      scheduleRoundId: 'round-2',
    }),
  'assignment push extras include season, group, and roundId'
);

console.log('ok: leagueBracketDeepLink.util.test.ts');
