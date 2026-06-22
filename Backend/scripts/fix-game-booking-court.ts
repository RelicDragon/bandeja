/**
 * Backfill courtId on a game + linked GameExternalBooking from Booktime booking resource.
 *
 * Usage:
 *   npx ts-node scripts/fix-game-booking-court.ts --game-id=<id> [--dry-run]
 */
import dotenv from 'dotenv';
dotenv.config();

import { ClubIntegrationType } from '@prisma/client';
import prisma from '../src/config/database';
import { parseBooktimeIntegrationConfig } from '../src/shared/clubIntegration';
import { BOOKTIME_DEFAULT_TIMEZONE } from '../src/shared/booktime/localTime';
import { syncGameBookingState } from '../src/services/game/gameExternalBooking.service';
import { decryptToken } from '../src/utils/tokenEncryption';

const BOOKTIME_API_URL = 'https://api.booktime.rs';

const dryRun = process.argv.includes('--dry-run');
const gameIdArg = process.argv.find((arg) => arg.startsWith('--game-id='));
const gameId = gameIdArg?.slice('--game-id='.length).trim();
if (!gameId) {
  console.error('Usage: npx ts-node scripts/fix-game-booking-court.ts --game-id=<id> [--dry-run]');
  process.exit(1);
}

type WireBooking = {
  uuid: string;
  bookingResourceId?: string;
  bookingResource?: { uuid?: string; id?: string; bookingResourceId?: string };
};

function bookingResourceExternalId(booking: WireBooking): string | null {
  const nested = booking.bookingResource;
  for (const candidate of [
    booking.bookingResourceId,
    nested?.bookingResourceId,
    nested?.uuid,
    nested?.id,
  ]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

async function findBooktimeAuth(gameId: string, clubId: string) {
  const participants = await prisma.gameParticipant.findMany({
    where: { gameId },
    select: { userId: true },
  });
  const participantIds = participants.map((p) => p.userId);
  return prisma.userClubBooktimeAuth.findFirst({
    where: {
      clubId,
      ...(participantIds.length > 0 ? { userId: { in: participantIds } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: { accessToken: true, refreshToken: true },
  });
}

async function fetchBookingFromApi(
  companyId: string,
  accessToken: string,
  externalBookingId: string,
): Promise<WireBooking | null> {
  const paths = ['/booking/get-upcoming', '/booking/get-previous'] as const;
  for (const path of paths) {
    let index = 0;
    for (;;) {
      const res = await fetch(`${BOOKTIME_API_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ companyId, index, size: 50 }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${path} failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as { bookings?: WireBooking[] };
      const bookings = Array.isArray(data.bookings) ? data.bookings : [];
      const hit = bookings.find((b) => b.uuid === externalBookingId);
      if (hit) return hit;
      if (bookings.length < 50) break;
      index += 50;
    }
  }
  return null;
}

async function main(): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      courtId: true,
      clubId: true,
      externalBookings: {
        where: { externalBookingProvider: ClubIntegrationType.BOOKTIME },
        select: { id: true, externalBookingId: true, courtId: true },
        orderBy: { createdAt: 'asc' },
      },
      club: {
        select: {
          integrationConfig: true,
          city: { select: { timezone: true } },
        },
      },
    },
  });

  if (!game) throw new Error(`Game not found: ${gameId}`);
  if (!game.clubId) throw new Error(`Game ${gameId} has no clubId`);
  const joinRow = game.externalBookings[0];
  if (!joinRow) throw new Error(`Game ${gameId} has no BOOKTIME link`);

  const config = parseBooktimeIntegrationConfig(game.club?.integrationConfig);
  const companyId = config?.companyId;
  if (!companyId) throw new Error(`Club ${game.clubId} missing Booktime companyId`);

  const auth = await findBooktimeAuth(game.id, game.clubId);
  if (!auth?.accessToken) throw new Error(`No Booktime auth for game participants at club ${game.clubId}`);

  const accessToken = decryptToken(auth.accessToken);
  const externalBookingId = joinRow.externalBookingId;
  const wireBooking = await fetchBookingFromApi(companyId, accessToken, externalBookingId);
  if (!wireBooking) {
    throw new Error(`Booking ${joinRow.externalBookingId} not found in Booktime API`);
  }

  const externalCourtId = bookingResourceExternalId(wireBooking);
  if (!externalCourtId) {
    throw new Error(`Booking ${joinRow.externalBookingId} has no resource id in API response`);
  }

  const court = await prisma.court.findFirst({
    where: { clubId: game.clubId, externalCourtId, isActive: true },
    select: { id: true, name: true, externalCourtId: true },
  });
  if (!court) {
    throw new Error(
      `No active court for club ${game.clubId} with externalCourtId=${externalCourtId}`,
    );
  }

  const timeZone = game.club?.city?.timezone ?? BOOKTIME_DEFAULT_TIMEZONE;
  console.log(
    JSON.stringify(
      {
        gameId: game.id,
        externalBookingId: joinRow.externalBookingId,
        externalCourtId,
        courtId: court.id,
        courtName: court.name,
        timeZone,
        dryRun,
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  await prisma.$transaction(async (tx) => {
    await tx.gameExternalBooking.update({
      where: { id: joinRow.id },
      data: { courtId: court.id },
    });
    if (!game.courtId) {
      await tx.game.update({
        where: { id: game.id },
        data: { courtId: court.id },
      });
    }
    await syncGameBookingState(tx, game.id);
  });

  const updated = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      courtId: true,
      bookingStatus: true,
      externalBookings: { select: { courtId: true, externalBookingId: true } },
    },
  });
  console.log('updated:', JSON.stringify(updated, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
