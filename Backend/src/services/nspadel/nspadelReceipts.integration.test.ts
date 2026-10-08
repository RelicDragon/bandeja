/**
 * NS Padel receipts in the bookings lists: booking clubs + per-club confirmed receipts.
 * Safe against the dev DB: rows are namespaced by a run suffix and removed in `finally`.
 */
import assert from 'node:assert/strict';
import { ClubIntegrationType, NspadelBookingState, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { getNspadelBookingClubs, listNspadelBookings } from './nspadelBookings.service';

void (async () => {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({ data: { name: `NS receipts ${s}`, country: 'Test', timezone: 'Europe/Belgrade' } });
  const user = await prisma.user.create({ data: { phone: `qa-ns-receipts-${s}`, firstName: 'NS', currentCityId: city.id, primarySport: Sport.PADEL } });
  const club = await prisma.club.create({
    data: { name: `NS club ${s}`, normalizedName: `ns club ${s}`, address: 'x', cityId: city.id, integrationType: ClubIntegrationType.NSPADELSUPABASE },
  });
  const court = await prisma.court.create({ data: { name: 'Teren 1', clubId: club.id, sport: Sport.PADEL, externalCourtId: 'up-1' } });
  try {
    assert.deepEqual((await getNspadelBookingClubs(user.id)).clubs, [], 'no receipts → no rows');
    const base = { userId: user.id, clubId: club.id, courtId: court.id, externalCourtId: 'up-1', durationMinutes: 60 };
    await prisma.nspadelBooking.createMany({
      data: [
        { ...base, date: '2030-05-05', startTime: '10:00', bookingStart: new Date('2030-05-05T08:00:00Z'), bookingEnd: new Date('2030-05-05T09:00:00Z'), state: NspadelBookingState.CONFIRMED, idempotencyKey: `a-${s}`, externalBookingId: 'nspadel:up-1:2030-05-05:10:00' },
        { ...base, date: '2030-05-06', startTime: '10:00', bookingStart: new Date('2030-05-06T08:00:00Z'), bookingEnd: new Date('2030-05-06T09:00:00Z'), state: NspadelBookingState.REJECTED, idempotencyKey: `b-${s}`, externalBookingId: 'nspadel:up-1:2030-05-06:10:00' },
      ],
    });
    const { clubs } = await getNspadelBookingClubs(user.id);
    assert.equal(clubs.length, 1);
    assert.equal(clubs[0].integrationType, 'NSPADELSUPABASE');
    assert.equal(clubs[0].connected, true);
    assert.deepEqual(clubs[0].courts.map((c) => c.externalCourtId), ['up-1']);
    const receipts = await listNspadelBookings(user.id, club.id);
    assert.deepEqual(receipts.map((r) => r.externalBookingId), ['nspadel:up-1:2030-05-05:10:00'], 'confirmed only');
    assert.equal(receipts[0].courtId, court.id);
    assert.deepEqual(await listNspadelBookings(`someone-else-${s}`, club.id), [], "never another user's receipts");
    console.log('nspadelReceipts.integration.test.ts: ok');
  } finally {
    await prisma.nspadelBooking.deleteMany({ where: { clubId: club.id } }).catch(() => undefined);
    await prisma.court.deleteMany({ where: { clubId: club.id } }).catch(() => undefined);
    await prisma.club.deleteMany({ where: { id: club.id } }).catch(() => undefined);
    await prisma.userSportProfile.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: user.id } }).catch(() => undefined);
    await prisma.city.deleteMany({ where: { id: city.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
