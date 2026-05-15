#!/usr/bin/env ts-node
/**
 * Club admin: DM templates, auth, holds, clear-court.
 * Run: DB_URL=... npx ts-node scripts/tests/club-admin.suite.ts
 */

import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { CourtSlotHoldLabel, EntityType, ParticipantRole } from '@prisma/client';
import { ApiError } from '../../src/utils/ApiError';
import { buildClubAdminDmMessage } from '../../src/utils/clubAdminDmMessage';
import { ClubAdminService } from '../../src/services/clubAdmin/clubAdmin.service';
import { ClubAdminHoldService } from '../../src/services/clubAdmin/clubAdminHold.service';
import { ClubAdminGameService } from '../../src/services/clubAdmin/clubAdminGame.service';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function expectApiError(p: Promise<unknown>, status: number): Promise<void> {
  try {
    await p;
    throw new Error(`expected ApiError ${status}, succeeded`);
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === status) return;
    throw e;
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

function runDmTemplateTests() {
  const cancelEn = buildClubAdminDmMessage({
    mode: 'cancel',
    lang: 'en',
    hostName: 'Alex',
    clubName: 'Padel Club',
    date: '15 May 2026',
    time: '10:00',
    reason: 'Maintenance',
    note: 'Sorry',
  });
  assert(cancelEn.includes('Alex'), 'cancel EN host');
  assert(cancelEn.includes('Padel Club'), 'cancel EN club');
  assert(cancelEn.includes('Maintenance'), 'cancel EN reason');

  const clearRu = buildClubAdminDmMessage({
    mode: 'clear',
    lang: 'ru',
    hostName: 'Иван',
    clubName: 'Клуб',
    date: '15 мая',
    time: '12:00',
    reason: 'Ошибка',
  });
  assert(clearRu.includes('Иван'), 'clear RU host');
  assert(clearRu.includes('снята'), 'clear RU wording');
  console.log('ok: DM templates');
}

async function runDbTests() {
  const { default: prisma } = await import('../../src/config/database');
  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const nonAdmins = await prisma.user.findMany({
    where: { isAdmin: false },
    take: 3,
    select: { id: true },
  });
  if (nonAdmins.length < 3) throw new Error('need at least 3 non-admin User rows');
  const [adminId, strangerId, hostId] = nonAdmins.map((u) => u.id);

  const suffix = `${Date.now()}`;
  const clubId = `qa-ca-club-${suffix}`;
  const courtId = `qa-ca-court-${suffix}`;
  const gameId = `qa-ca-game-${suffix}`;

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);

  await prisma.club.create({
    data: {
      id: clubId,
      name: `QA Club ${suffix}`,
      normalizedName: `qa-club-${suffix}`,
      address: 'QA',
      cityId: city.id,
    },
  });
  await prisma.court.create({
    data: { id: courtId, name: 'Court 1', clubId, isIndoor: true, isActive: true },
  });
  await prisma.clubAdmin.create({ data: { userId: adminId, clubId } });
  await prisma.game.create({
    data: {
      id: gameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      clubId,
      courtId,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      hasBookedCourt: false,
      maxParticipants: 4,
      minParticipants: 2,
      participants: { create: [{ userId: hostId, role: ParticipantRole.OWNER }] },
    },
  });

  try {
    await expectApiError(ClubAdminService.assertClubAdmin(strangerId, clubId), 403);
    console.log('ok: stranger not club admin -> 403');

    await expectApiError(
      ClubAdminHoldService.createHold(strangerId, clubId, {
        courtId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        label: CourtSlotHoldLabel.WALK_IN,
      }),
      403
    );
    console.log('ok: stranger cannot create hold');

    const hold = await ClubAdminHoldService.createHold(adminId, clubId, {
      courtId,
      startTime: new Date(start.getTime() + 7_200_000).toISOString(),
      endTime: new Date(start.getTime() + 10_800_000).toISOString(),
      label: CourtSlotHoldLabel.PHONE,
    });
    assert(!!hold.id, 'admin hold created');
    console.log('ok: admin hold created');

    await ClubAdminGameService.clearCourtSlot(adminId, clubId, gameId, {
      reason: 'Schedule change',
    });
    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      select: { courtId: true, timeIsSet: true, hasBookedCourt: true },
    });
    assert(updated?.courtId === null, 'court cleared');
    assert(updated?.timeIsSet === false, 'timeIsSet cleared');
    console.log('ok: clear-court strips slot');

    await ClubAdminHoldService.deleteHold(adminId, hold.id);
  } finally {
    await prisma.courtSlotHold.deleteMany({ where: { clubId } });
    await prisma.gameParticipant.deleteMany({ where: { gameId } });
    await prisma.game.deleteMany({ where: { id: gameId } });
    await prisma.clubAdmin.deleteMany({ where: { clubId } });
    await prisma.court.deleteMany({ where: { id: courtId } });
    await prisma.club.deleteMany({ where: { id: clubId } });
  }
}

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
  runDmTemplateTests();

  if (!ensureDbUrl()) {
    console.log('club-admin.suite: skipped DB tests (set DB_URL)');
    console.log('club-admin.suite: DM checks passed');
    return;
  }

  await runDbTests();
  console.log('club-admin.suite: all checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
