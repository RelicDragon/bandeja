/**
 * Pair challenge against a real database (`challengeUserTeam`).
 *
 *   · the challenger pair is seated through add-pair-to-game and the challenged
 *     pair gets ordinary invites stamped with their `inviteUserTeamId`;
 *   · those invites read as a challenge (`loadInviteChallengeTeams`), the
 *     partner's own add-to-game invite does not;
 *   · accepting through the normal invite path seats both pairs as the two
 *     fixed teams, and only PLAYING rows fill the four slots;
 *   · refusals: an 8-player game, a non-member, an unfinished opponent pair —
 *     each before anything is written;
 *   · a complete pair is readable by a non-member, an unfinished one is not.
 *
 * Safe to run against `padelpulse_dev`: rows are namespaced and removed in
 * `finally`. Outbound notifications are suppressed by `E2E_TEST`.
 */
import assert from 'node:assert/strict';
import {
  EntityType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  Sport,
  UserTeamMemberStatus,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { InviteService } from '../invite.service';
import { UserTeamService } from '../userTeam.service';
import { challengeUserTeam } from './userTeamChallenge.service';
import { loadInviteChallengeTeams } from './userTeamChallengeNotice';

process.env.E2E_TEST = '1';

const HOURS = 60 * 60 * 1000;

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdUserIds: string[] = [];
  const createdGameIds: string[] = [];
  const createdTeamIds: string[] = [];
  let slot = 0;

  const city = await prisma.city.create({
    data: { name: `Pair challenge ${suffix}`, country: 'Test', timezone: 'UTC' },
  });

  const makeUser = async (name: string) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-challenge-${name}-${suffix}`,
        firstName: name,
        currentCityId: city.id,
        primarySport: Sport.PADEL,
      },
    });
    createdUserIds.push(user.id);
    await prisma.userSportProfile.create({ data: { userId: user.id, sport: Sport.PADEL, level: 3 } });
    return user;
  };

  const makeTeam = async (name: string, ownerId: string, partnerId: string, partnerStatus: UserTeamMemberStatus) => {
    const team = await prisma.userTeam.create({
      data: {
        name: `${name} ${suffix}`,
        ownerId,
        size: 2,
        members: {
          create: [
            { userId: ownerId, status: UserTeamMemberStatus.ACCEPTED, isOwner: true, joinedAt: new Date() },
            { userId: partnerId, status: partnerStatus, isOwner: false },
          ],
        },
      },
    });
    createdTeamIds.push(team.id);
    return team;
  };

  const makeGame = async (ownerId: string, maxParticipants: number) => {
    slot += 1;
    const startTime = new Date(Date.now() + (slot + 3) * 24 * HOURS);
    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime: new Date(startTime.getTime() + 90 * 60 * 1000),
        timeIsSet: true,
        isPublic: true,
        maxParticipants,
        playersPerMatch: 4,
        hasFixedTeams: true,
        participants: {
          create: [{ userId: ownerId, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING }],
        },
      },
    });
    createdGameIds.push(game.id);
    return game;
  };

  const rejection = async (run: () => Promise<unknown>): Promise<ApiError> => {
    try {
      await run();
    } catch (error) {
      if (error instanceof ApiError) return error;
      throw error;
    }
    throw new assert.AssertionError({ message: 'expected a rejection' });
  };

  const inviteLike = async (gameId: string, receiverId: string) => {
    const row = await prisma.gameParticipant.findFirstOrThrow({
      where: { gameId, userId: receiverId },
      include: { game: { include: { participants: true } } },
    });
    return {
      receiverId,
      sender: row.invitedByUserId ? { id: row.invitedByUserId } : null,
      game: row.game,
    };
  };

  try {
    const me = await makeUser('me');
    const mate = await makeUser('mate');
    const rivalA = await makeUser('rivalA');
    const rivalB = await makeUser('rivalB');
    const loner = await makeUser('loner');
    const pendingMate = await makeUser('pendingMate');
    const outsider = await makeUser('outsider');

    const myTeam = await makeTeam('Smash Bros', me.id, mate.id, UserTeamMemberStatus.ACCEPTED);
    const rivals = await makeTeam('Lob Squad', rivalA.id, rivalB.id, UserTeamMemberStatus.ACCEPTED);
    const unfinished = await makeTeam('Half Pair', loner.id, pendingMate.id, UserTeamMemberStatus.PENDING);

    // --- happy path -------------------------------------------------------
    const game = await makeGame(me.id, 4);
    const result = await challengeUserTeam({
      challengedTeamId: rivals.id,
      challengerTeamId: myTeam.id,
      viewerId: me.id,
      isAdmin: false,
      gameId: game.id,
    });
    assert.equal(result.challengerPartnerInvited, true, 'my partner gets the add-pair invite');
    assert.deepEqual([...result.invitedUserIds].sort(), [rivalA.id, rivalB.id].sort());
    assert.deepEqual(result.alreadyInGameUserIds, []);

    const rows = await prisma.gameParticipant.findMany({ where: { gameId: game.id } });
    const row = (userId: string) => rows.find((r) => r.userId === userId)!;
    assert.equal(row(me.id).inviteUserTeamId, myTeam.id, 'the challenger is tagged with their pair');
    assert.equal(row(mate.id).status, ParticipantStatus.INVITED);
    assert.equal(row(mate.id).inviteUserTeamId, myTeam.id);
    for (const rival of [rivalA, rivalB]) {
      assert.equal(row(rival.id).status, ParticipantStatus.INVITED);
      assert.equal(row(rival.id).inviteUserTeamId, rivals.id, 'the opponents are invited as their pair');
    }

    assert.deepEqual(await loadInviteChallengeTeams(await inviteLike(game.id, rivalA.id)), {
      challengerTeamName: myTeam.name,
      challengedTeamName: rivals.name,
    });
    assert.equal(
      await loadInviteChallengeTeams(await inviteLike(game.id, mate.id)),
      null,
      "the partner's invite is a pair invite, not a challenge",
    );

    // Accept through the ordinary invite path.
    for (const userId of [mate.id, rivalA.id, rivalB.id]) {
      const accepted = await InviteService.acceptInvite(row(userId).id, userId);
      assert.equal(accepted.success, true, `accept for ${userId}`);
    }
    assert.equal(
      await prisma.gameParticipant.count({ where: { gameId: game.id, status: ParticipantStatus.PLAYING } }),
      4,
    );
    const fixedTeams = await prisma.gameTeam.findMany({
      where: { gameId: game.id },
      include: { players: { select: { userId: true } } },
    });
    const rosters = fixedTeams.map((t) => t.players.map((p) => p.userId).sort().join(',')).sort();
    assert.deepEqual(
      rosters,
      [[me.id, mate.id].sort().join(','), [rivalA.id, rivalB.id].sort().join(',')].sort(),
      'both pairs end up as the two fixed teams',
    );

    // --- refusals, before anything is written ------------------------------
    const big = await makeGame(me.id, 8);
    const notEligible = await rejection(() =>
      challengeUserTeam({
        challengedTeamId: rivals.id,
        challengerTeamId: myTeam.id,
        viewerId: me.id,
        isAdmin: false,
        gameId: big.id,
      }),
    );
    assert.equal(notEligible.message, 'errors.userTeams.challengeGameNotEligible');
    assert.equal(await prisma.gameParticipant.count({ where: { gameId: big.id } }), 1, 'nothing written');

    const fresh = await makeGame(me.id, 4);
    const notMember = await rejection(() =>
      challengeUserTeam({
        challengedTeamId: rivals.id,
        challengerTeamId: myTeam.id,
        viewerId: outsider.id,
        isAdmin: false,
        gameId: fresh.id,
      }),
    );
    assert.equal(notMember.statusCode, 403);

    const opponentNotReady = await rejection(() =>
      challengeUserTeam({
        challengedTeamId: unfinished.id,
        challengerTeamId: myTeam.id,
        viewerId: me.id,
        isAdmin: false,
        gameId: fresh.id,
      }),
    );
    assert.equal(opponentNotReady.message, 'errors.userTeams.challengeOpponentNotReady');
    assert.equal(await prisma.gameParticipant.count({ where: { gameId: fresh.id } }), 1, 'nothing written');

    // --- who can read a team page -----------------------------------------
    const seen = await UserTeamService.getTeamForUser(rivals.id, outsider.id);
    assert.equal(seen.id, rivals.id, 'a complete pair is readable by anyone');
    const hidden = await rejection(() => UserTeamService.getTeamForUser(unfinished.id, outsider.id));
    assert.equal(hidden.statusCode, 403, 'an unfinished team stays member-only');
    const own = await UserTeamService.getTeamForUser(unfinished.id, pendingMate.id);
    assert.equal(own.id, unfinished.id, 'an invited member still sees it');

    console.log('userTeamChallenge.integration.test.ts: ok');
  } finally {
    await prisma.chatMessage.deleteMany({ where: { gameId: { in: createdGameIds } } });
    await prisma.chatSyncEvent.deleteMany({ where: { contextId: { in: createdGameIds } } });
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } });
    await prisma.userTeam.deleteMany({ where: { id: { in: createdTeamIds } } });
    await prisma.userSportProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.city.deleteMany({ where: { id: city.id } });
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
