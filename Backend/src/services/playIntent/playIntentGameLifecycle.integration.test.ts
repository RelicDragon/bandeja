import assert from 'node:assert/strict';
import {
  EntityType,
  GameInviteOutcomeType,
  ParticipantRole,
  ParticipantStatus,
  PlayIntentStatus,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { InviteService } from '../invite.service';
import { PlayIntentGameCreationService } from './playIntentGameCreation.service';
import { PlayIntentGameLifecycleService } from './playIntentGameLifecycle.service';

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({
    data: {
      name: `Lifecycle ${suffix}`,
      country: 'Test',
      timezone: 'UTC',
    },
  });
  const [host, invitee, decliner, expiringUser] = await Promise.all([
    prisma.user.create({
      data: {
        phone: `qa-lifecycle-host-${suffix}`,
        firstName: 'Host',
        currentCityId: city.id,
      },
    }),
    prisma.user.create({
      data: {
        phone: `qa-lifecycle-decliner-${suffix}`,
        firstName: 'Decliner',
        currentCityId: city.id,
      },
    }),
    prisma.user.create({
      data: {
        phone: `qa-lifecycle-expiring-${suffix}`,
        firstName: 'Expiring',
        currentCityId: city.id,
      },
    }),
    prisma.user.create({
      data: {
        phone: `qa-lifecycle-invitee-${suffix}`,
        firstName: 'Invitee',
        currentCityId: city.id,
      },
    }),
  ]);
  const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  startTime.setUTCHours(18, 0, 0, 0);
  const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);
  const dateKey = startTime.toISOString().slice(0, 10);
  const expiresAt = new Date(endTime.getTime() + 60 * 60 * 1000);
  const [hostIntent, inviteeIntent] = await Promise.all([
    prisma.playIntent.create({
      data: {
        userId: host.id,
        cityId: city.id,
        sport: Sport.PADEL,
        entityType: EntityType.GAME,
        dateKeys: [dateKey],
        clubIds: [],
        status: PlayIntentStatus.OPEN,
        expiresAt,
      },
    }),
    prisma.playIntent.create({
      data: {
        userId: invitee.id,
        cityId: city.id,
        sport: Sport.PADEL,
        entityType: EntityType.GAME,
        dateKeys: [dateKey],
        clubIds: [],
        status: PlayIntentStatus.OPEN,
        expiresAt,
      },
    }),
  ]);

  let gameId: string | null = null;
  try {
    gameId = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const prepared = await PlayIntentGameCreationService.prepare(
        tx,
        {
          type: 'DIRECT',
          hostIntentId: hostIntent.id,
          invitees: [{ userId: invitee.id, intentId: inviteeIntent.id }],
        },
        host.id,
        {
          cityId: city.id,
          sport: Sport.PADEL,
          entityType: EntityType.GAME,
          startTime,
          clubId: null,
          minLevel: null,
          maxLevel: null,
          genderTeams: 'ANY',
          maxParticipants: 4,
        },
        now,
      );
      const participants =
        PlayIntentGameCreationService.participantCreates(prepared);
      assert.ok(participants);
      const game = await tx.game.create({
        data: {
          entityType: EntityType.GAME,
          sport: Sport.PADEL,
          gameType: 'CLASSIC',
          cityId: city.id,
          startTime,
          endTime,
          timeIsSet: true,
          participants: { create: participants },
        },
      });
      await PlayIntentGameCreationService.finalize(tx, prepared, game.id, now);
      return game.id;
    });

    const [storedHostIntent, storedInviteeIntent, participants] =
      await Promise.all([
        prisma.playIntent.findUniqueOrThrow({ where: { id: hostIntent.id } }),
        prisma.playIntent.findUniqueOrThrow({ where: { id: inviteeIntent.id } }),
        prisma.gameParticipant.findMany({
          where: { gameId },
          orderBy: { role: 'asc' },
        }),
      ]);
    assert.equal(storedHostIntent.status, PlayIntentStatus.CONSUMED);
    assert.equal(storedInviteeIntent.status, PlayIntentStatus.MATCHED);
    assert.equal(
      participants.find((participant) => participant.userId === host.id)
        ?.playIntentId,
      hostIntent.id,
    );
    const pendingInvite = participants.find(
      (participant) => participant.userId === invitee.id,
    );
    assert.equal(pendingInvite?.status, ParticipantStatus.INVITED);
    assert.equal(pendingInvite?.playIntentId, inviteeIntent.id);
    assert.ok(pendingInvite);

    const accepted = await InviteService.acceptInvite(
      pendingInvite.id,
      invitee.id,
    );
    assert.equal(accepted.success, true);
    const consumed = await prisma.playIntent.findUniqueOrThrow({
      where: { id: inviteeIntent.id },
    });
    assert.equal(consumed.status, PlayIntentStatus.CONSUMED);
    const acceptedParticipant = await prisma.gameParticipant.findUniqueOrThrow({
      where: { id: pendingInvite.id },
    });
    assert.equal(acceptedParticipant.status, ParticipantStatus.PLAYING);

    const declinerIntent = await prisma.playIntent.create({
      data: {
        userId: decliner.id,
        cityId: city.id,
        sport: Sport.PADEL,
        entityType: EntityType.GAME,
        dateKeys: [dateKey],
        clubIds: [],
        status: PlayIntentStatus.MATCHED,
        expiresAt,
      },
    });
    const declineParticipant = await prisma.gameParticipant.create({
      data: {
        gameId,
        userId: decliner.id,
        role: ParticipantRole.PARTICIPANT,
        status: ParticipantStatus.INVITED,
        playIntentId: declinerIntent.id,
        invitedByUserId: host.id,
        inviteExpiresAt: expiresAt,
      },
    });
    const declined = await InviteService.declineInvite(
      declineParticipant.id,
      decliner.id,
    );
    assert.equal(declined.success, true);
    assert.equal(
      (
        await prisma.playIntent.findUniqueOrThrow({
          where: { id: declinerIntent.id },
        })
      ).status,
      PlayIntentStatus.OPEN,
    );

    const expiredAt = new Date(Date.now() - 60_000);
    const expiringIntent = await prisma.playIntent.create({
      data: {
        userId: expiringUser.id,
        cityId: city.id,
        sport: Sport.PADEL,
        entityType: EntityType.GAME,
        dateKeys: [dateKey],
        clubIds: [],
        status: PlayIntentStatus.MATCHED,
        expiresAt: expiredAt,
      },
    });
    const expiringParticipant = await prisma.gameParticipant.create({
      data: {
        gameId,
        userId: expiringUser.id,
        role: ParticipantRole.PARTICIPANT,
        status: ParticipantStatus.INVITED,
        playIntentId: expiringIntent.id,
        invitedByUserId: host.id,
        inviteExpiresAt: expiredAt,
      },
    });
    await prisma.$transaction(async (tx) => {
      await PlayIntentGameLifecycleService.closeLinkedInvite(
        tx,
        {
          id: expiringParticipant.id,
          gameId: expiringParticipant.gameId,
          userId: expiringParticipant.userId,
          invitedByUserId: expiringParticipant.invitedByUserId,
          playIntentId: expiringParticipant.playIntentId,
        },
        GameInviteOutcomeType.EXPIRED,
        new Date(),
      );
    });
    assert.equal(
      await prisma.gameParticipant.findUnique({
        where: { id: expiringParticipant.id },
      }),
      null,
    );
    assert.equal(
      (
        await prisma.playIntent.findUniqueOrThrow({
          where: { id: expiringIntent.id },
        })
      ).status,
      PlayIntentStatus.EXPIRED,
    );
  } finally {
    if (gameId) {
      await prisma.game.deleteMany({ where: { id: gameId } });
    }
    await prisma.playIntent.deleteMany({
      where: { id: { in: [hostIntent.id, inviteeIntent.id] } },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [host.id, invitee.id, decliner.id, expiringUser.id] },
      },
    });
    await prisma.city.deleteMany({ where: { id: city.id } });
    await prisma.$disconnect();
  }
})();
