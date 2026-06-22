/**
 * Remove stale Booktime links from a game and resync booking state.
 * Optionally targets a specific external booking id.
 *
 * Usage:
 *   npx ts-node scripts/fix-game-unlink-booking.ts --game-id=<id> [--booking-id=<uuid>] [--dry-run]
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { syncGameBookingState } from '../src/services/game/gameExternalBooking.service';
import { findLinkedGamesForBooking } from '../src/services/booktime/booktimeGameLink.service';

const dryRun = process.argv.includes('--dry-run');
const gameIdArg = process.argv.find((arg) => arg.startsWith('--game-id='));
const bookingIdArg = process.argv.find((arg) => arg.startsWith('--booking-id='));
const gameId = gameIdArg?.slice('--game-id='.length).trim();
const bookingIdFilter = bookingIdArg?.slice('--booking-id='.length).trim();

if (!gameId) {
  console.error(
    'Usage: npx ts-node scripts/fix-game-unlink-booking.ts --game-id=<id> [--booking-id=<uuid>] [--dry-run]',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const before = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      courtId: true,
      clubId: true,
      hasBookedCourt: true,
      bookingStatus: true,
      startTime: true,
      endTime: true,
      externalBookings: {
        select: { id: true, externalBookingId: true, courtId: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!before) throw new Error(`Game not found: ${gameId}`);
  const resolvedGameId = before.id;

  const toRemove = before.externalBookings.filter(
    (row) => !bookingIdFilter || row.externalBookingId === bookingIdFilter,
  );

  console.log(
    JSON.stringify(
      {
        dryRun,
        before: {
          ...before,
          startTime: before.startTime.toISOString(),
          endTime: before.endTime.toISOString(),
        },
        toRemove: toRemove.map((row) => ({
          id: row.id,
          externalBookingId: row.externalBookingId,
        })),
      },
      null,
      2,
    ),
  );

  if (toRemove.length === 0) {
    await prisma.$transaction(async (tx) => {
      await syncGameBookingState(tx, resolvedGameId, { clearBookedCourtWhenUnlinked: true });
    });
    console.log('no join rows removed; resynced booking state only');
  } else if (!dryRun) {
    await prisma.$transaction(async (tx) => {
      await tx.gameExternalBooking.deleteMany({
        where: { id: { in: toRemove.map((row) => row.id) } },
      });
      await syncGameBookingState(tx, resolvedGameId, { clearBookedCourtWhenUnlinked: true });
    });
    console.log(`removed ${toRemove.length} booking link(s)`);
  }

  if (!dryRun) {
    const after = await prisma.game.findUnique({
      where: { id: resolvedGameId },
      select: {
        courtId: true,
        hasBookedCourt: true,
        bookingStatus: true,
        externalBookings: { select: { externalBookingId: true, courtId: true } },
      },
    });
    console.log('after:', JSON.stringify(after, null, 2));

    for (const row of toRemove) {
      const stillLinked = await findLinkedGamesForBooking(row.externalBookingId);
      console.log(
        `linked-games for ${row.externalBookingId}:`,
        stillLinked.map((g) => g.id),
      );
    }
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
