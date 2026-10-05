import assert from 'node:assert/strict';
import { UserTeamMemberStatus } from '@prisma/client';
import {
  challengeSeatsFit,
  deriveInviteChallenge,
  isChallengeableGame,
} from '@bandeja/shared/userTeamChallenge';
import { ApiError } from '../../utils/ApiError';
import { assertChallengePairs, type ChallengeTeamShape } from './userTeamChallengeRules';

const ACCEPTED = UserTeamMemberStatus.ACCEPTED;
const PENDING = UserTeamMemberStatus.PENDING;

const team = (id: string, members: Array<[string, UserTeamMemberStatus]>): ChallengeTeamShape => ({
  id,
  size: 2,
  members: members.map(([userId, status]) => ({ userId, status })),
});

const errorOf = (run: () => void): ApiError => {
  try {
    run();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new assert.AssertionError({ message: 'expected an ApiError' });
};

const mine = team('t1', [['me', ACCEPTED], ['mate', ACCEPTED]]);
const theirs = team('t2', [['a', ACCEPTED], ['b', ACCEPTED]]);

// --- assertChallengePairs -------------------------------------------------
assert.doesNotThrow(() => assertChallengePairs('me', mine, theirs));

assert.equal(errorOf(() => assertChallengePairs('me', mine, mine)).message, 'errors.userTeams.challengeSameTeam');

assert.equal(
  errorOf(() => assertChallengePairs('stranger', mine, theirs)).statusCode,
  403,
  'only a member of the challenger team may issue the challenge',
);

assert.equal(
  errorOf(() => assertChallengePairs('me', team('t1', [['me', PENDING], ['mate', ACCEPTED]]), theirs)).message,
  'errors.userTeams.notAcceptedMember',
);

assert.equal(
  errorOf(() => assertChallengePairs('me', team('t1', [['me', ACCEPTED], ['mate', PENDING]]), theirs)).message,
  'errors.userTeams.notReady',
  'the challenger pair must be complete',
);

assert.equal(
  errorOf(() => assertChallengePairs('me', mine, team('t2', [['a', ACCEPTED], ['b', PENDING]]))).message,
  'errors.userTeams.challengeOpponentNotReady',
  'the challenged pair must be complete',
);

assert.equal(
  errorOf(() => assertChallengePairs('me', mine, team('t3', [['mate', ACCEPTED], ['b', ACCEPTED]]))).message,
  'errors.userTeams.challengeSameTeam',
  'pairs that share a player cannot face each other',
);

// --- isChallengeableGame --------------------------------------------------
assert.equal(isChallengeableGame({ entityType: 'GAME', maxParticipants: 4 }), true);
assert.equal(isChallengeableGame({ entityType: 'GAME', maxParticipants: 8 }), false);
assert.equal(isChallengeableGame({ entityType: 'GAME', maxParticipants: 2 }), false);
assert.equal(isChallengeableGame({ entityType: 'TOURNAMENT', maxParticipants: 4 }), false);
assert.equal(isChallengeableGame({ entityType: 'TRAINING', maxParticipants: 4 }), false);

// --- challengeSeatsFit ----------------------------------------------------
assert.equal(challengeSeatsFit(1, false), true, 'only the viewer playing');
assert.equal(challengeSeatsFit(2, true), true, 'the pair is in, two seats free');
assert.equal(challengeSeatsFit(2, false), false, 'a stranger holds a seat');
assert.equal(challengeSeatsFit(3, true), false);

// --- deriveInviteChallenge ------------------------------------------------
const game = (participants: Array<{ userId: string; inviteUserTeamId?: string | null }>, max = 4) => ({
  entityType: 'GAME',
  maxParticipants: max,
  participants,
});

assert.deepEqual(
  deriveInviteChallenge({
    receiverId: 'a',
    senderId: 'me',
    game: game([
      { userId: 'me', inviteUserTeamId: 't1' },
      { userId: 'a', inviteUserTeamId: 't2' },
    ]),
  }),
  { challengerTeamId: 't1', challengedTeamId: 't2' },
);

assert.equal(
  deriveInviteChallenge({
    receiverId: 'mate',
    senderId: 'me',
    game: game([
      { userId: 'me', inviteUserTeamId: 't1' },
      { userId: 'mate', inviteUserTeamId: 't1' },
    ]),
  }),
  null,
  'adding your own pair is not a challenge',
);

assert.equal(
  deriveInviteChallenge({
    receiverId: 'a',
    senderId: 'me',
    game: game([{ userId: 'me' }, { userId: 'a', inviteUserTeamId: 't2' }]),
  }),
  null,
  'a solo organizer inviting a pair is a pair invite, not a challenge',
);

assert.equal(
  deriveInviteChallenge({
    receiverId: 'a',
    senderId: 'me',
    game: game(
      [
        { userId: 'me', inviteUserTeamId: 't1' },
        { userId: 'a', inviteUserTeamId: 't2' },
      ],
      8,
    ),
  }),
  null,
  'an eight-player social is never a challenge',
);

assert.equal(
  deriveInviteChallenge({ receiverId: 'a', senderId: null, game: game([{ userId: 'a', inviteUserTeamId: 't2' }]) }),
  null,
);

console.log('userTeamChallenge.test.ts ok');
