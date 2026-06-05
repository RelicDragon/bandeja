import dotenv from 'dotenv';
dotenv.config();

import { LevelChangeEventType, ResultsStatus } from '@prisma/client';
import prisma from '../src/config/database';
import { shouldCreateGameLevelChangeEvent } from '../src/services/results/outcomeStatsSnapshot';
import { createGameEvent } from '../src/services/levelChange';

const BATCH_SIZE = 100;
const dryRun = process.argv.includes('--dry-run');

async function backfillNonRatingGameLevelEvents() {
  let cursor: string | undefined;
  let gamesScanned = 0;
  let eventsCreated = 0;
  let eventsSkipped = 0;

  for (;;) {
    const games = await prisma.game.findMany({
      where: {
        resultsStatus: ResultsStatus.FINAL,
        outcomes: { some: {} },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        sport: true,
        entityType: true,
        affectsRating: true,
        finishedDate: true,
        endTime: true,
        outcomes: {
          select: {
            userId: true,
            levelBefore: true,
            levelAfter: true,
            levelChange: true,
            createdAt: true,
          },
        },
      },
    });

    if (games.length === 0) break;

    for (const game of games) {
      gamesScanned += 1;

      const existing = await prisma.levelChangeEvent.findMany({
        where: {
          gameId: game.id,
          eventType: LevelChangeEventType.GAME,
        },
        select: { userId: true },
      });
      const existingUserIds = new Set(existing.map((e) => e.userId));

      const eventAt =
        game.finishedDate ?? game.endTime ?? game.outcomes[0]?.createdAt ?? new Date();

      for (const outcome of game.outcomes) {
        if (existingUserIds.has(outcome.userId)) {
          eventsSkipped += 1;
          continue;
        }

        if (!shouldCreateGameLevelChangeEvent(game.affectsRating, outcome.levelChange)) {
          eventsSkipped += 1;
          continue;
        }

        if (dryRun) {
          console.log(
            `[dry-run] create GAME event game=${game.id} user=${outcome.userId} ` +
              `level=${outcome.levelBefore} affectsRating=${game.affectsRating}`,
          );
        } else {
          await createGameEvent(prisma, {
            userId: outcome.userId,
            gameId: game.id,
            sport: game.sport,
            linkEntityType: game.entityType,
            affectsRating: game.affectsRating,
            levelBefore: outcome.levelBefore,
            levelAfter: outcome.levelAfter,
            levelChange: outcome.levelChange,
            createdAt: eventAt,
          });
        }
        eventsCreated += 1;
      }
    }

    cursor = games[games.length - 1]?.id;
    if (games.length < BATCH_SIZE) break;
  }

  console.log(
    `backfillNonRatingGameLevelEvents: games=${gamesScanned} created=${eventsCreated} skipped=${eventsSkipped} dryRun=${dryRun}`,
  );
}

backfillNonRatingGameLevelEvents()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
