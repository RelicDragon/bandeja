import assert from 'node:assert/strict';
import {
  EntityType,
  GameInviteOutcomeType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { InviteService } from '../invite.service';

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({
    data: {
      name: `Cancel invite authorization ${suffix}`,
      country: 'Test',
      timezone: 'UTC',
    },
  });
  const users = await Promise.all(
    [
      'owner',
      'sender',
      'admin',
      'other-participant',
      'invitee-owner',
      'invitee-admin',
      'invitee-sender',
    ].map((name) =>
      prisma.user.create({
        data: {
          phone: `qa-cancel-invite-${name}-${suffix}`,
          firstName: name,
          currentCityId: city.id,
        },
      }),
    ),
  );
  const [
    owner,
    sender,
    admin,
    otherParticipant,
    ownerCancelledInvitee,
    adminCancelledInvitee,
    senderCancelledInvitee,
  ] = users;
  const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);
  let gameId: string | null = null;

  try {
    const game = await prisma.game.create({
      data: {
        entityType: EntityType.TOURNAMENT,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime,
        timeIsSet: true,
        anyoneCanInvite: true,
        participants: {
          create: [
            {
              userId: owner.id,
              role: ParticipantRole.OWNER,
              status: ParticipantStatus.NON_PLAYING,
            },
            {
              userId: sender.id,
              role: ParticipantRole.PARTICIPANT,
              status: ParticipantStatus.PLAYING,
            },
            {
              userId: admin.id,
              role: ParticipantRole.ADMIN,
              status: ParticipantStatus.NON_PLAYING,
            },
            {
              userId: otherParticipant.id,
              role: ParticipantRole.PARTICIPANT,
              status: ParticipantStatus.PLAYING,
            },
            {
              userId: ownerCancelledInvitee.id,
              role: ParticipantRole.PARTICIPANT,
              status: ParticipantStatus.INVITED,
              invitedByUserId: sender.id,
            },
            {
              userId: adminCancelledInvitee.id,
              role: ParticipantRole.PARTICIPANT,
              status: ParticipantStatus.INVITED,
              invitedByUserId: sender.id,
            },
            {
              userId: senderCancelledInvitee.id,
              role: ParticipantRole.PARTICIPANT,
              status: ParticipantStatus.INVITED,
              invitedByUserId: sender.id,
            },
          ],
        },
      },
      include: { participants: true },
    });
    gameId = game.id;
    const ownerCancelledInvite = game.participants.find(
      (participant) => participant.userId === ownerCancelledInvitee.id,
    );
    const senderCancelledInvite = game.participants.find(
      (participant) => participant.userId === senderCancelledInvitee.id,
    );
    const adminCancelledInvite = game.participants.find(
      (participant) => participant.userId === adminCancelledInvitee.id,
    );
    assert.ok(ownerCancelledInvite);
    assert.ok(adminCancelledInvite);
    assert.ok(senderCancelledInvite);

    const ownerResult = await InviteService.cancelInvite(ownerCancelledInvite.id, owner.id);
    assert.deepEqual(ownerResult, {
      success: true,
      message: 'invites.cancelledSuccessfully',
    });
    assert.equal(
      await prisma.gameParticipant.findUnique({ where: { id: ownerCancelledInvite.id } }),
      null,
    );
    assert.equal(
      (
        await prisma.gameInviteOutcome.findUniqueOrThrow({
          where: {
            gameId_userId: {
              gameId: game.id,
              userId: ownerCancelledInvitee.id,
            },
          },
        })
      ).outcome,
      GameInviteOutcomeType.CANCELLED,
    );

    const participantResult = await InviteService.cancelInvite(
      adminCancelledInvite.id,
      otherParticipant.id,
    );
    assert.deepEqual(participantResult, {
      success: false,
      message: 'errors.invites.onlySenderCanCancel',
    });

    const adminResult = await InviteService.cancelInvite(adminCancelledInvite.id, admin.id);
    assert.deepEqual(adminResult, {
      success: true,
      message: 'invites.cancelledSuccessfully',
    });

    const senderResult = await InviteService.cancelInvite(senderCancelledInvite.id, sender.id);
    assert.deepEqual(senderResult, {
      success: true,
      message: 'invites.cancelledSuccessfully',
    });

    // cancelInvite publishes a best-effort realtime lookup without awaiting it.
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    if (gameId) {
      await prisma.game.deleteMany({ where: { id: gameId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.city.deleteMany({ where: { id: city.id } });
    await prisma.$disconnect();
  }
})();
