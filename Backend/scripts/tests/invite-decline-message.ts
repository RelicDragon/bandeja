#!/usr/bin/env ts-node
/**
 * Invite decline optional message: chat post, validation, admin ignore.
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/invite-decline-message.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { EntityType, GameStatus, MessageType, ParticipantRole } from '@prisma/client';
import { ApiError } from '../../src/utils/ApiError';
import { InviteService } from '../../src/services/invite.service';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function ensureDbUrl() {
  let url = process.env.DB_URL;
  if (!url) return false;
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
  return true;
}

async function expectApiError(p: Promise<unknown>, status: number, label: string) {
  try {
    await p;
    console.error(`FAIL: ${label} — expected ApiError ${status}`);
    process.exit(1);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === status) {
      console.log(`ok: ${label}`);
      return;
    }
    throw e;
  }
}

async function seedInvitedParticipant(
  prisma: typeof import('../../src/config/database').default,
  cityId: string,
  ownerId: string,
  inviteeId: string,
  suffix: string
) {
  const gameId = `qa-idm-${suffix}`;
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  await prisma.game.create({
    data: {
      id: gameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.ANNOUNCED,
      maxParticipants: 4,
      minParticipants: 2,
      participants: {
        create: [{ userId: ownerId, role: ParticipantRole.OWNER, status: 'NON_PLAYING' }],
      },
    },
  });
  const participant = await prisma.gameParticipant.create({
    data: {
      gameId,
      userId: inviteeId,
      role: ParticipantRole.PARTICIPANT,
      status: 'INVITED',
      invitedByUserId: ownerId,
    },
  });
  return { gameId, participantId: participant.id };
}

async function countInviteeTextMessages(
  prisma: typeof import('../../src/config/database').default,
  gameId: string,
  inviteeId: string
) {
  return prisma.chatMessage.count({
    where: {
      chatContextType: 'GAME',
      contextId: gameId,
      senderId: inviteeId,
      chatType: 'PUBLIC',
      messageType: MessageType.TEXT,
      deletedAt: null,
    },
  });
}

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

  if (!ensureDbUrl()) {
    console.log('invite-decline-message: skipped (set DB_URL)');
    process.exit(0);
  }

  const { default: prisma } = await import('../../src/config/database');
  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({
    where: { isAdmin: false },
    take: 3,
    select: { id: true },
  });
  if (users.length < 3) throw new Error('need at least 3 non-admin users');
  const [ownerId, inviteeId] = users.map((u) => u.id);

  const adminUser = await prisma.user.findFirst({
    where: { isAdmin: true },
    select: { id: true },
  });
  if (!adminUser) throw new Error('need an admin user');

  const suffix = `${Date.now()}`;
  const gameIds: string[] = [];
  const participantIds: string[] = [];

  try {
    const noMsg = await seedInvitedParticipant(prisma, city.id, ownerId, inviteeId, `a-${suffix}`);
    gameIds.push(noMsg.gameId);
    participantIds.push(noMsg.participantId);

    const before = await countInviteeTextMessages(prisma, noMsg.gameId, inviteeId);
    const resultNoMsg = await InviteService.declineInvite(noMsg.participantId, inviteeId, false);
    assert(resultNoMsg.success, 'decline without message succeeds');
    const after = await countInviteeTextMessages(prisma, noMsg.gameId, inviteeId);
    assert(after === before, 'decline without message posts no user chat');
    const removed = await prisma.gameParticipant.findUnique({ where: { id: noMsg.participantId } });
    assert(removed == null, 'participant removed after decline without message');
    console.log('ok: decline without message');

    const withMsg = await seedInvitedParticipant(prisma, city.id, ownerId, inviteeId, `b-${suffix}`);
    gameIds.push(withMsg.gameId);
    participantIds.push(withMsg.participantId);
    const reason = `Cannot make it QA ${suffix}`;
    const resultWithMsg = await InviteService.declineInvite(
      withMsg.participantId,
      inviteeId,
      false,
      reason
    );
    assert(resultWithMsg.success, 'decline with message succeeds');
    const msg = await prisma.chatMessage.findFirst({
      where: {
        chatContextType: 'GAME',
        contextId: withMsg.gameId,
        senderId: inviteeId,
        content: reason,
      },
    });
    assert(msg != null, 'decline with message posts public chat from invitee');
    const removed2 = await prisma.gameParticipant.findUnique({ where: { id: withMsg.participantId } });
    assert(removed2 == null, 'participant removed after decline with message');
    console.log('ok: decline with message');

    const wsOnly = await seedInvitedParticipant(prisma, city.id, ownerId, inviteeId, `c-${suffix}`);
    gameIds.push(wsOnly.gameId);
    participantIds.push(wsOnly.participantId);
    const beforeWs = await countInviteeTextMessages(prisma, wsOnly.gameId, inviteeId);
    const resultWs = await InviteService.declineInvite(wsOnly.participantId, inviteeId, false, '   \n  ');
    assert(resultWs.success, 'whitespace-only decline succeeds');
    const afterWs = await countInviteeTextMessages(prisma, wsOnly.gameId, inviteeId);
    assert(afterWs === beforeWs, 'whitespace-only posts no user chat');
    console.log('ok: whitespace-only message');

    const tooLong = await seedInvitedParticipant(prisma, city.id, ownerId, inviteeId, `d-${suffix}`);
    gameIds.push(tooLong.gameId);
    participantIds.push(tooLong.participantId);
    await expectApiError(
      InviteService.declineInvite(tooLong.participantId, inviteeId, false, 'x'.repeat(10001)),
      400,
      'message too long'
    );
    const stillInvited = await prisma.gameParticipant.findUnique({
      where: { id: tooLong.participantId },
    });
    assert(stillInvited?.status === 'INVITED', 'too-long message keeps invite pending');
    console.log('ok: message too long rejected');

    const adminCase = await seedInvitedParticipant(prisma, city.id, ownerId, inviteeId, `e-${suffix}`);
    gameIds.push(adminCase.gameId);
    participantIds.push(adminCase.participantId);
    const beforeAdmin = await countInviteeTextMessages(prisma, adminCase.gameId, inviteeId);
    const resultAdmin = await InviteService.declineInvite(
      adminCase.participantId,
      adminUser.id,
      true,
      'admin should not post this'
    );
    assert(resultAdmin.success, 'admin decline succeeds');
    const afterAdmin = await countInviteeTextMessages(prisma, adminCase.gameId, inviteeId);
    assert(afterAdmin === beforeAdmin, 'admin decline ignores message body');
    const removedAdmin = await prisma.gameParticipant.findUnique({
      where: { id: adminCase.participantId },
    });
    assert(removedAdmin == null, 'admin decline removes participant');
    console.log('ok: admin decline ignores message');
  } finally {
    for (const gameId of gameIds) {
      await prisma.chatMessage.deleteMany({ where: { contextId: gameId } });
      await prisma.gameInviteOutcome.deleteMany({ where: { gameId } });
      await prisma.gameParticipant.deleteMany({ where: { gameId } });
      await prisma.game.deleteMany({ where: { id: gameId } });
    }
  }

  console.log('ok: invite-decline-message');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
