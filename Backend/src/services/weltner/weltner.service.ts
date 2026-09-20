import { Prisma, type WeltnerBooking } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { assertWeltnerDate, normalizeWeltnerPhone, weltnerBookingRange } from './weltnerContract';
import {
  fetchWeltnerAvailability,
  postWeltnerBooking,
  WeltnerRejectedError,
} from './weltnerClient';

async function getClub(clubId: string) {
  const club = await prisma.club.findFirst({
    where: { id: clubId, integrationType: 'WELTNER', isActive: true },
    include: {
      city: { select: { timezone: true } },
      courts: { where: { isActive: true }, orderBy: { name: 'asc' } },
    },
  });
  if (!club) throw new ApiError(404, 'weltner.clubNotConfigured');
  return club;
}

export async function getWeltnerAuth(userId: string, clubId: string) {
  await getClub(clubId);
  const row = await prisma.userClubWeltnerAuth.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });
  return { connected: !!row, phoneNumber: row?.phoneNumber ?? null };
}

export async function saveWeltnerAuth(userId: string, clubId: string, phone: unknown) {
  await getClub(clubId);
  const phoneNumber = normalizeWeltnerPhone(phone);
  await prisma.userClubWeltnerAuth.upsert({
    where: { userId_clubId: { userId, clubId } },
    create: { userId, clubId, phoneNumber },
    update: { phoneNumber },
  });
  return { connected: true, phoneNumber };
}

export async function disconnectWeltner(userId: string, clubId: string) {
  await prisma.userClubWeltnerAuth.deleteMany({ where: { userId, clubId } });
}

export async function getWeltnerMyClubs(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentCityId: true },
  });
  const auths = await prisma.userClubWeltnerAuth.findMany({
    where: { userId },
  });
  const receipts = await prisma.weltnerBooking.findMany({
    where: { userId },
    select: { clubId: true },
    distinct: ['clubId'],
  });
  const clubs = await prisma.club.findMany({
    where: {
      integrationType: 'WELTNER',
      isActive: true,
      OR: [
        ...(user?.currentCityId ? [{ cityId: user.currentCityId }] : []),
        {
          id: {
            in: [...auths.map((a) => a.clubId), ...receipts.map((r) => r.clubId)],
          },
        },
      ],
    },
    include: {
      city: { select: { timezone: true } },
      courts: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          externalCourtId: true,
          integrationCourtName: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  return {
    cityWeltnerClubCount: clubs.filter((c) => c.cityId === user?.currentCityId).length,
    clubs: clubs.map((club) => ({
      clubId: club.id,
      clubName: club.name,
      avatar: club.avatar,
      integrationType: 'WELTNER' as const,
      connected: auths.some((a) => a.clubId === club.id),
      phoneNumber: auths.find((a) => a.clubId === club.id)?.phoneNumber ?? null,
      scoutOptIn: false,
      needsReauth: false,
      cityTimezone: club.city.timezone,
      courts: club.courts,
    })),
  };
}

export async function getWeltnerAvailability(clubId: string, date: string) {
  const club = await getClub(clubId);
  assertWeltnerDate(date, club.city.timezone || 'Europe/Belgrade');
  const courts = club.courts.filter((c) => c.externalCourtId);
  if (!courts.length) throw new ApiError(400, 'weltner.clubNotConfigured');
  return {
    date,
    courts: await Promise.all(
      courts.map(async (court) => ({
        courtId: court.id,
        externalCourtId: court.externalCourtId!,
        ...(await fetchWeltnerAvailability(court.externalCourtId!, date)),
      })),
    ),
  };
}

export function weltnerReceipt(row: WeltnerBooking) {
  return {
    externalBookingId: `weltner:${row.id}`,
    referenceType: 'LOCAL_RECEIPT' as const,
    upstreamBookingId: row.upstreamBookingId,
    courtId: row.courtId,
    bookingStart: row.bookingStart.toISOString(),
    bookingEnd: row.bookingEnd.toISOString(),
    state: row.state,
  };
}

export async function listWeltnerBookings(userId: string, clubId: string) {
  await getClub(clubId);
  return (
    await prisma.weltnerBooking.findMany({
      where: {
        userId,
        clubId,
        state: { in: ['CONFIRMED', 'UNKNOWN', 'SUBMITTING'] },
      },
      orderBy: { bookingStart: 'asc' },
    })
  ).map(weltnerReceipt);
}

export async function createWeltnerBooking(input: {
  userId: string;
  clubId: string;
  courtId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
}) {
  const { userId, clubId, courtId, date, startTime, durationMinutes } = input;
  const club = await getClub(clubId);
  const court = club.courts.find((c) => c.id === courtId && c.externalCourtId);
  if (!court) throw new ApiError(400, 'weltner.invalidCourt');
  const auth = await prisma.userClubWeltnerAuth.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });
  if (!auth) throw new ApiError(403, 'weltner.connectRequired');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  if (!name || name.length > 160) throw new ApiError(400, 'weltner.nameRequired');
  const key = { userId, clubId, courtId, date, startTime, durationMinutes };
  const unique = { userId_clubId_courtId_date_startTime_durationMinutes: key };
  const existing = await prisma.weltnerBooking.findUnique({ where: unique });
  if (existing?.state === 'CONFIRMED') return weltnerReceipt(existing);
  if (existing && existing.state !== 'REJECTED') throw new ApiError(409, 'weltner.bookingUnknown');
  const timezone = club.city.timezone || 'Europe/Belgrade';
  assertWeltnerDate(date, timezone);
  const range = weltnerBookingRange(date, startTime, durationMinutes, timezone);
  if (range.bookingStart <= new Date()) throw new ApiError(400, 'weltner.invalidSlot');
  const available = await fetchWeltnerAvailability(court.externalCourtId!, date);
  if (!available.slots.some((s) => s.start === startTime && s.duration === durationMinutes))
    throw new ApiError(409, 'errors.booking.slotNoLongerAvailable');
  let attempt: WeltnerBooking;
  try {
    if (existing) {
      const claimed = await prisma.weltnerBooking.updateMany({
        where: { id: existing.id, state: 'REJECTED' },
        data: { state: 'SUBMITTING' },
      });
      if (!claimed.count) throw new ApiError(409, 'weltner.bookingUnknown');
      attempt = existing;
    } else {
      attempt = await prisma.weltnerBooking.create({
        data: { ...key, ...range },
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ApiError(409, 'weltner.bookingUnknown');
    throw error;
  }
  try {
    const upstreamBookingId = await postWeltnerBooking({
      court: court.externalCourtId!,
      date,
      start: startTime,
      duration: String(durationMinutes),
      name,
      phone: auth.phoneNumber,
    });
    return weltnerReceipt(
      await prisma.weltnerBooking.update({
        where: { id: attempt.id },
        data: { state: 'CONFIRMED', upstreamBookingId },
      }),
    );
  } catch (error) {
    const rejected = error instanceof WeltnerRejectedError;
    await prisma.weltnerBooking.update({
      where: { id: attempt.id },
      data: { state: rejected ? 'REJECTED' : 'UNKNOWN' },
    });
    throw new ApiError(
      rejected ? 409 : 502,
      rejected ? 'weltner.bookingRejected' : 'weltner.bookingUnknown',
    );
  }
}
