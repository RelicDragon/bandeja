import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { decryptToken } from '../src/utils/tokenEncryption';
import { findLinkedGamesForBooking } from '../src/services/booktime/booktimeGameLink.service';

const BOOKTIME_API_URL = 'https://api.booktime.rs';
const companyId = '002f8a6a-6433-490f-9bae-726b98399672';

const gameIdArg = process.argv.find((arg) => arg.startsWith('--game-id='));
const gameId = gameIdArg?.slice('--game-id='.length).trim();
if (!gameId) {
  console.error('Usage: npx ts-node scripts/inspect-game-booking-links.ts --game-id=<id>');
  process.exit(1);
}

type WireBooking = {
  uuid: string;
  bookingStart: string;
  bookingEnd: string;
  status?: string;
};

async function fetchBookings(accessToken: string, path: '/booking/get-upcoming' | '/booking/get-previous') {
  const out: WireBooking[] = [];
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
    if (!res.ok) break;
    const data = (await res.json()) as { bookings?: WireBooking[] };
    const bookings = Array.isArray(data.bookings) ? data.bookings : [];
    out.push(...bookings);
    if (bookings.length < 50) break;
    index += 50;
  }
  return out;
}

async function main(): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      parentId: true,
      clubId: true,
      startTime: true,
      endTime: true,
      externalBookings: { select: { id: true, externalBookingId: true } },
      participants: { select: { userId: true, role: true } },
    },
  });
  if (!game?.clubId) throw new Error('Game not found or missing club');

  console.log('game:', JSON.stringify(game, null, 2));

  const userIds = new Set<string>(game.participants.map((p) => p.userId));
  if (game.parentId) {
    const parentOwner = await prisma.gameParticipant.findFirst({
      where: { gameId: game.parentId, role: 'OWNER' },
      select: { userId: true },
    });
    if (parentOwner) userIds.add(parentOwner.userId);
  }

  let foundLink = false;
  for (const userId of userIds) {
    const auth = await prisma.userClubBooktimeAuth.findFirst({
      where: { userId, clubId: game.clubId },
      select: { accessToken: true },
    });
    if (!auth?.accessToken) {
      console.log('no auth for', userId);
      continue;
    }
    const token = decryptToken(auth.accessToken);
    const bookings = [
      ...(await fetchBookings(token, '/booking/get-upcoming')),
      ...(await fetchBookings(token, '/booking/get-previous')),
    ];
    for (const booking of bookings) {
      const linked = await findLinkedGamesForBooking(booking.uuid);
      const linkedIds = linked.map((g) => g.id);
      const status = booking.status?.toUpperCase() ?? '';
      const overlaps =
        new Date(booking.bookingStart) < game.endTime &&
        new Date(booking.bookingEnd) > game.startTime;
      if (
        linkedIds.includes(game.id) ||
        status.includes('CANCEL') ||
        overlaps
      ) {
        foundLink = true;
        console.log(
          JSON.stringify({
            userId,
            uuid: booking.uuid,
            status: booking.status,
            bookingStart: booking.bookingStart,
            bookingEnd: booking.bookingEnd,
            overlaps,
            linkedIds,
            linkedToThisGame: linkedIds.includes(game.id),
          }),
        );
      }
    }
  }

  if (!foundLink && game.externalBookings.length === 0) {
    console.log('no booktime bookings linked or overlapping for inspected users');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
