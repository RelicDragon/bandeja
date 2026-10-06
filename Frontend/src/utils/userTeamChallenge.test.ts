import { describe, expect, it } from 'vitest';
import type { UserTeam, UserTeamMembership } from '@/types';
import type { UserTeamInvitableGame } from '@/api/userTeams';
import { deriveInviteChallenge } from '@shared/userTeamChallenge';
import {
  buildChallengeNavigationState,
  challengeStillIntact,
  challengerTeamsFor,
  isChallengeGameOption,
  pairRowChallengeState,
  viewerPendingPair,
} from './userTeamChallenge';

const user = (id: string) => ({ id, firstName: id, lastName: '' }) as UserTeam['owner'];

const team = (id: string, members: Array<[string, 'ACCEPTED' | 'PENDING']>, name = id): UserTeam =>
  ({
    id,
    name,
    avatar: null,
    originalAvatar: null,
    ownerId: members[0]![0],
    size: 2,
    createdAt: '',
    updatedAt: '',
    owner: user(members[0]![0]),
    members: members.map(([userId, status], i) => ({
      id: `${id}-${userId}`,
      teamId: id,
      userId,
      status,
      isOwner: i === 0,
      joinedAt: null,
      createdAt: '',
      updatedAt: '',
      user: user(userId),
    })),
  }) as UserTeam;

const membership = (t: UserTeam, userId: string): UserTeamMembership => {
  const m = t.members.find((row) => row.userId === userId)!;
  return { ...m, team: t };
};

describe('challengerTeamsFor', () => {
  const mine = team('mine', [['me', 'ACCEPTED'], ['mate', 'ACCEPTED']]);
  const partnerOwned = team('partnerOwned', [['other', 'ACCEPTED'], ['me', 'ACCEPTED']]);
  const half = team('half', [['me', 'ACCEPTED'], ['nobody', 'PENDING']]);

  it('offers the viewer complete pairs, owned or joined', () => {
    const result = challengerTeamsFor('me', [membership(partnerOwned, 'me')], [mine, half], ['a', 'b']);
    expect(result.map((t) => t.id).sort()).toEqual(['mine', 'partnerOwned']);
  });

  it('drops pairs that share a player with the target', () => {
    expect(challengerTeamsFor('me', [], [mine], ['mate', 'b'])).toEqual([]);
  });

  it('never offers a challenge to the viewer own pair', () => {
    expect(challengerTeamsFor('me', [], [mine], ['me', 'mate'])).toEqual([]);
  });

  it('needs a signed-in viewer', () => {
    expect(challengerTeamsFor(undefined, [], [mine], ['a', 'b'])).toEqual([]);
  });
});

describe('pairRowChallengeState', () => {
  const mine = team('mine', [['me', 'ACCEPTED'], ['mate', 'ACCEPTED']]);
  const row = (a: string, b: string, teamId: string | null, isViewerPair = false) => ({
    teamId,
    isViewerPair,
    userA: { id: a },
    userB: { id: b },
  });

  it('offers a challenge on someone else\'s team', () => {
    expect(pairRowChallengeState('me', [mine], row('a', 'b', 't1'))).toBe('available');
  });

  it('marks an ad-hoc pair: no team to challenge', () => {
    expect(pairRowChallengeState('me', [mine], row('a', 'b', null))).toBe('notTeam');
  });

  it('marks a team that shares the viewer\'s partner', () => {
    expect(pairRowChallengeState('me', [mine], row('mate', 'b', 't1'))).toBe('sharesPlayer');
  });

  it('uses another complete pair of the viewer when one shares a player', () => {
    const other = team('other', [['me', 'ACCEPTED'], ['x', 'ACCEPTED']]);
    expect(pairRowChallengeState('me', [mine, other], row('mate', 'b', 't1'))).toBe('available');
  });

  it('shows nothing on the viewer\'s own pairs or without a complete pair', () => {
    expect(pairRowChallengeState('me', [mine], row('me', 'mate', 'mine', true))).toBeNull();
    expect(pairRowChallengeState('me', [mine], row('me', 'q', null))).toBeNull();
    expect(pairRowChallengeState('me', [], row('a', 'b', 't1'))).toBeNull();
    expect(pairRowChallengeState(undefined, [mine], row('a', 'b', 't1'))).toBeNull();
  });
});

describe('viewerPendingPair', () => {
  it('finds the viewer\'s pair still waiting for a partner, owned or joined', () => {
    const half = team('half', [['me', 'ACCEPTED'], ['nobody', 'PENDING']]);
    expect(viewerPendingPair('me', [], [half])?.id).toBe('half');
    expect(viewerPendingPair('me', [membership(half, 'me')], [])?.id).toBe('half');
  });

  it('ignores complete pairs and pairs the viewer was only invited to', () => {
    const full = team('full', [['me', 'ACCEPTED'], ['mate', 'ACCEPTED']]);
    const invited = team('invited', [['owner', 'ACCEPTED'], ['me', 'PENDING']]);
    expect(viewerPendingPair('me', [membership(invited, 'me')], [full])).toBeNull();
  });
});

describe('isChallengeGameOption', () => {
  const game = (patch: Partial<UserTeamInvitableGame>): UserTeamInvitableGame =>
    ({
      id: 'g',
      entityType: 'GAME',
      maxParticipants: 4,
      playingCount: 1,
      partnerOnGame: 'none',
      ...patch,
    }) as UserTeamInvitableGame;

  it('keeps 2v2 games with room for the other pair', () => {
    expect(isChallengeGameOption(game({}))).toBe(true);
    expect(isChallengeGameOption(game({ playingCount: 2, partnerOnGame: 'playing' }))).toBe(true);
  });

  it('drops games where a stranger already holds a seat', () => {
    expect(isChallengeGameOption(game({ playingCount: 2 }))).toBe(false);
  });

  it('drops anything that is not a 2v2 GAME', () => {
    expect(isChallengeGameOption(game({ maxParticipants: 8 }))).toBe(false);
    expect(isChallengeGameOption(game({ entityType: 'TOURNAMENT' }))).toBe(false);
  });
});

describe('buildChallengeNavigationState', () => {
  const mine = team('mine', [['me', 'ACCEPTED'], ['mate', 'ACCEPTED']], 'Smash');
  const theirs = team('theirs', [['a', 'ACCEPTED'], ['b', 'ACCEPTED']], 'Lob');

  it('prefills a fixed-teams 2v2 with the partner and both opponents invited as their pairs', () => {
    const state = buildChallengeNavigationState('me', mine, theirs, 'PADEL');
    expect(state.entityType).toBe('GAME');
    expect(state.initialGameData).toMatchObject({ sport: 'PADEL', maxParticipants: 4, hasFixedTeams: true });
    expect(state.invitedPlayerIds).toEqual(['mate', 'a', 'b']);
    expect(state.invitedPlayers.map((u) => u.id)).toEqual(['mate', 'a', 'b']);
    expect(state.inviteUserTeamIds).toEqual({ mate: 'mine', a: 'theirs', b: 'theirs' });
    expect(state.challenge).toEqual({
      challengerTeamId: 'mine',
      challengedTeamId: 'theirs',
      challengerTeamName: 'Smash',
      challengedTeamName: 'Lob',
    });
  });

  it('falls back to plain invites once the organizer removed a prefilled player', () => {
    expect(challengeStillIntact(['mate', 'a', 'b'], ['b', 'a', 'mate', 'x'])).toBe(true);
    expect(challengeStillIntact(['mate', 'a', 'b'], ['mate', 'a'])).toBe(false);
  });
});

describe('deriveInviteChallenge (shared)', () => {
  const game = (participants: Array<{ userId: string; inviteUserTeamId?: string | null }>) => ({
    entityType: 'GAME',
    maxParticipants: 4,
    participants,
  });

  it('reads an opponent invite as a challenge', () => {
    expect(
      deriveInviteChallenge({
        receiverId: 'a',
        senderId: 'me',
        game: game([
          { userId: 'me', inviteUserTeamId: 'mine' },
          { userId: 'a', inviteUserTeamId: 'theirs' },
        ]),
      }),
    ).toEqual({ challengerTeamId: 'mine', challengedTeamId: 'theirs' });
  });

  it('does not read a teammate invite as a challenge', () => {
    expect(
      deriveInviteChallenge({
        receiverId: 'mate',
        senderId: 'me',
        game: game([
          { userId: 'me', inviteUserTeamId: 'mine' },
          { userId: 'mate', inviteUserTeamId: 'mine' },
        ]),
      }),
    ).toBeNull();
  });
});
