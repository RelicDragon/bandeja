#!/usr/bin/env ts-node
/**
 * Game chat socket filtering: participant join gate + ADMINS recipient resolution.
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/game-chat-socket-filter.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { ChatType, EntityType, GameStatus, ParticipantRole } from '@prisma/client';
import { MessageService } from '../../src/services/chat/message.service';
import { resolveGameChatSocketRecipientIds } from '../../src/services/chat/gameChatSocketRecipients';

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

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

  if (!ensureDbUrl()) {
    console.log('game-chat-socket-filter: skipped (set DB_URL)');
    process.exit(0);
  }

  const { default: prisma } = await import('../../src/config/database');
  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({
    where: { isAdmin: false },
    take: 4,
    select: { id: true },
  });
  if (users.length < 4) throw new Error('need at least 4 non-admin users');

  const [ownerId, playingId, outsiderId, parentAdminId] = users.map((u) => u.id);
  const suffix = `${Date.now()}`;
  const gameId = `qa-gcsf-${suffix}`;
  const parentGameId = `qa-gcsf-parent-${suffix}`;
  const childGameId = `qa-gcsf-child-${suffix}`;

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  const gameIds = [gameId, parentGameId, childGameId];

  await prisma.game.create({
    data: {
      id: gameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.ANNOUNCED,
      maxParticipants: 4,
      minParticipants: 2,
      participants: {
        create: [
          { userId: ownerId, role: ParticipantRole.OWNER, status: 'NON_PLAYING' },
          { userId: playingId, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
        ],
      },
    },
  });

  await prisma.game.create({
    data: {
      id: parentGameId,
      entityType: EntityType.LEAGUE,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.ANNOUNCED,
      participants: {
        create: [{ userId: parentAdminId, role: ParticipantRole.OWNER, status: 'NON_PLAYING' }],
      },
    },
  });

  await prisma.game.create({
    data: {
      id: childGameId,
      entityType: EntityType.LEAGUE,
      gameType: 'CLASSIC',
      cityId: city.id,
      parentId: parentGameId,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.ANNOUNCED,
      participants: {
        create: [{ userId: playingId, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' }],
      },
    },
  });

  try {
    const outsiderAccess = await MessageService.validateGameAccess(gameId, outsiderId);
    assert(!outsiderAccess.isParticipant, 'non-participant denied game access for room join');
    console.log('ok: non-participant denied game access for room join');

    const playingAccess = await MessageService.validateGameAccess(gameId, playingId);
    assert(playingAccess.isParticipant, 'playing participant allowed game access for room join');
    console.log('ok: playing participant allowed game access for room join');

    const adminsRecipients = await resolveGameChatSocketRecipientIds(gameId, ChatType.ADMINS);
    assert(adminsRecipients.includes(ownerId), 'owner receives ADMINS socket recipients');
    assert(!adminsRecipients.includes(playingId), 'playing participant excluded from ADMINS socket recipients');
    console.log('ok: ADMINS socket recipients exclude regular participant, include admin');

    const publicRecipients = await resolveGameChatSocketRecipientIds(gameId, ChatType.PUBLIC);
    assert(publicRecipients.includes(ownerId), 'owner in PUBLIC socket recipients');
    assert(publicRecipients.includes(playingId), 'playing participant in PUBLIC socket recipients');
    console.log('ok: PUBLIC socket recipients include all active participants');

    const childAdminsRecipients = await resolveGameChatSocketRecipientIds(childGameId, ChatType.ADMINS);
    assert(
      childAdminsRecipients.includes(parentAdminId),
      'parent-game owner in child ADMINS socket recipients'
    );
    assert(
      !childAdminsRecipients.includes(playingId),
      'child playing participant excluded from child ADMINS socket recipients'
    );
    console.log('ok: parent-game admin included in child ADMINS socket recipients');
  } finally {
    for (const id of gameIds) {
      await prisma.gameParticipant.deleteMany({ where: { gameId: id } });
      await prisma.game.deleteMany({ where: { id } });
    }
  }

  console.log('ok: game-chat-socket-filter');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
