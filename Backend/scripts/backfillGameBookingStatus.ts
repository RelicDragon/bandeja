import prisma from '../src/config/database';
import { recomputeGameBookingStatusForGame } from '../src/services/game/gameExternalBooking.service';

const BATCH_SIZE = 200;

async function backfillGameBookingStatus(): Promise<void> {
  let cursor: string | undefined;
  let updated = 0;

  for (;;) {
    const games = await prisma.game.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    if (games.length === 0) break;

    for (const game of games) {
      const before = await prisma.game.findUnique({
        where: { id: game.id },
        select: { bookingStatus: true, hasBookedCourt: true },
      });
      await recomputeGameBookingStatusForGame(game.id);
      const after = await prisma.game.findUnique({
        where: { id: game.id },
        select: { bookingStatus: true, hasBookedCourt: true },
      });
      if (
        before?.bookingStatus !== after?.bookingStatus ||
        before?.hasBookedCourt !== after?.hasBookedCourt
      ) {
        updated += 1;
      }
    }

    cursor = games[games.length - 1]?.id;
    console.log(`Processed through game ${cursor}; updated ${updated} so far`);
  }

  console.log(`Backfill complete. Updated ${updated} games.`);
}

backfillGameBookingStatus()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
