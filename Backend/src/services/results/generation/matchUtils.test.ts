import { playersPerMatchOf, playersPerTeamOf } from './matchUtils';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(playersPerMatchOf({ playersPerMatch: 2 }) === 2, 'playersPerMatchOf singles');
assert(playersPerMatchOf({ playersPerMatch: 4 }) === 4, 'playersPerMatchOf doubles');
assert(playersPerMatchOf({}) === 4, 'playersPerMatchOf default');

assert(playersPerTeamOf({ playersPerMatch: 2 }) === 1, 'playersPerTeamOf singles');
assert(playersPerTeamOf({ playersPerMatch: 4 }) === 2, 'playersPerTeamOf doubles');
assert(playersPerTeamOf({}) === 2, 'playersPerTeamOf default');

console.log('ok: matchUtils playersPerTeamOf');
