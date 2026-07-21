import assert from 'node:assert/strict';
import { resolveLeagueGroupStandingsMode } from './leagueGroupStandingsMode';

assert.equal(resolveLeagueGroupStandingsMode({ hasFixedTeams: true, playersPerMatch: 4 }), 'fixedTeam');
assert.equal(resolveLeagueGroupStandingsMode({ hasFixedTeams: true, playersPerMatch: 2 }), 'fixedTeam');
assert.equal(resolveLeagueGroupStandingsMode({ hasFixedTeams: false, playersPerMatch: 2 }), 'userSingles');
assert.equal(resolveLeagueGroupStandingsMode({ hasFixedTeams: false, playersPerMatch: 4 }), null);
assert.equal(resolveLeagueGroupStandingsMode({ hasFixedTeams: false }), null);

console.log('leagueGroupStandingsMode.test.ts: ok');
