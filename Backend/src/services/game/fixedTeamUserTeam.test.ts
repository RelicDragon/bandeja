import assert from 'node:assert/strict';
import { pickUserTeamForRoster, type UserTeamCandidate } from './fixedTeamUserTeam';

const at = (iso: string) => new Date(iso);
const team = (over: Partial<UserTeamCandidate> & { id: string }): UserTeamCandidate => ({
  name: over.id,
  avatar: null,
  cutAngle: 45,
  color: null,
  ownerId: 'a',
  size: 2,
  updatedAt: at('2026-01-01'),
  acceptedMemberIds: ['a', 'b'],
  ...over,
});

// Exact accepted roster matches, in any order; the summary carries what the face needs.
assert.deepEqual(
  pickUserTeamForRoster(['b', 'a'], [
    team({ id: 't1', name: 'Smash Bros', cutAngle: 120, color: 'coral', ownerId: 'b' }),
  ]),
  { id: 't1', name: 'Smash Bros', avatar: null, cutAngle: 120, color: 'coral', ownerId: 'b' },
);

// One player only, a different partner, or a bigger team: no match.
assert.equal(pickUserTeamForRoster(['a', 'c'], [team({ id: 't1' })]), null);
assert.equal(pickUserTeamForRoster(['a'], [team({ id: 't1' })]), null);
assert.equal(pickUserTeamForRoster(['a', 'a'], [team({ id: 't1' })]), null);
assert.equal(pickUserTeamForRoster([], [team({ id: 't1' })]), null);
assert.equal(
  pickUserTeamForRoster(['a', 'b'], [team({ id: 't1', size: 3, acceptedMemberIds: ['a', 'b', 'c'] })]),
  null,
);
// Partner still PENDING (not in accepted ids) → not a team yet.
assert.equal(pickUserTeamForRoster(['a', 'b'], [team({ id: 't1', acceptedMemberIds: ['a'] })]), null);
// A team of the right size whose accepted set has a third player is not this pair.
assert.equal(
  pickUserTeamForRoster(['a', 'b'], [team({ id: 't1', acceptedMemberIds: ['a', 'b', 'c'] })]),
  null,
);

// Duplicates: uploaded avatar wins, then most recently edited, then id.
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
assert.equal(
  pickUserTeamForRoster(['a', 'b'], [team({ id: 't2' }), team({ id: 't1' })])?.id,
  't1',
);

// The game's own word beats avatar/recency: the name copied onto GameTeam.name …
assert.equal(
  pickUserTeamForRoster(
    ['a', 'b'],
    [
      team({ id: 't1', name: 'Net Ninjas', avatar: 'https://cdn/x.jpg', updatedAt: at('2026-05-01') }),
      team({ id: 't2', name: 'Lob Stars', updatedAt: at('2026-02-01') }),
    ],
    { teamName: '  lob stars ' },
  )?.id,
  't2',
);
// … then the team the pair was invited as.
assert.equal(
  pickUserTeamForRoster(
    ['a', 'b'],
    [
      team({ id: 't1', avatar: 'https://cdn/x.jpg', updatedAt: at('2026-05-01') }),
      team({ id: 't2', updatedAt: at('2026-02-01') }),
    ],
    { teamName: 'Team 1', inviteUserTeamIds: [undefined, 't2'] },
  )?.id,
  't2',
);
// A name hint never creates a match on its own.
assert.equal(
  pickUserTeamForRoster(['a', 'c'], [team({ id: 't1', name: 'X' })], { teamName: 'X', inviteUserTeamIds: ['t1'] }),
  null,
);

console.log('fixedTeamUserTeam tests passed');
