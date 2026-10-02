import assert from 'node:assert/strict';
import { pickUserTeamForRoster, type UserTeamCandidate } from './fixedTeamUserTeam';

const at = (iso: string) => new Date(iso);
const team = (over: Partial<UserTeamCandidate> & { id: string }): UserTeamCandidate => ({
  name: over.id,
  avatar: null,
  size: 2,
  updatedAt: at('2026-01-01'),
  acceptedMemberIds: ['a', 'b'],
  ...over,
});

// Exact accepted roster matches, in any order.
assert.deepEqual(pickUserTeamForRoster(['b', 'a'], [team({ id: 't1', name: 'Smash Bros' })]), {
  id: 't1',
  name: 'Smash Bros',
  avatar: null,
});

// One player only, a different partner, or a bigger team: no match.
assert.equal(pickUserTeamForRoster(['a', 'c'], [team({ id: 't1' })]), null);
assert.equal(pickUserTeamForRoster(['a'], [team({ id: 't1' })]), null);
assert.equal(
  pickUserTeamForRoster(['a', 'b'], [team({ id: 't1', size: 3, acceptedMemberIds: ['a', 'b', 'c'] })]),
  null,
);
// Partner still PENDING (not in accepted ids) → not a team yet.
assert.equal(pickUserTeamForRoster(['a', 'b'], [team({ id: 't1', acceptedMemberIds: ['a'] })]), null);

// Duplicates: uploaded avatar wins, then most recently edited.
assert.equal(
  pickUserTeamForRoster(['a', 'b'], [
    team({ id: 't1', updatedAt: at('2026-05-01') }),
    team({ id: 't2', avatar: 'https://cdn/x.jpg', updatedAt: at('2026-02-01') }),
  ])?.id,
  't2',
);
assert.equal(
  pickUserTeamForRoster(['a', 'b'], [
    team({ id: 't1', updatedAt: at('2026-02-01') }),
    team({ id: 't2', updatedAt: at('2026-05-01') }),
  ])?.id,
  't2',
);

console.log('fixedTeamUserTeam tests passed');
