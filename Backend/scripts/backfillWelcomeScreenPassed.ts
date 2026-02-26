import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { ResultsStatus } from '@prisma/client';

async function backfill() {
  const participantsWithFinalGame = await prisma.gameParticipant.findMany({
    where: { game: { resultsStatus: ResultsStatus.FINAL } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const userIdsWithFinalGame = new Set(participantsWithFinalGame.map((p) => p.userId));

  const users = await prisma.user.findMany({
    select: { id: true, level: true },
  });

  const idsPassedTrue: string[] = [];
  const idsPassedFalse: string[] = [];
  for (const user of users) {
    const passed = user.level !== 1.0 || userIdsWithFinalGame.has(user.id);
    if (passed) idsPassedTrue.push(user.id);
    else idsPassedFalse.push(user.id);
  }

  const [resultTrue, resultFalse] = await Promise.all([
    idsPassedTrue.length > 0
      ? prisma.user.updateMany({
          where: { id: { in: idsPassedTrue } },
          data: { welcomeScreenPassed: true },
        })
      : { count: 0 },
    idsPassedFalse.length > 0
      ? prisma.user.updateMany({
          where: { id: { in: idsPassedFalse } },
          data: { welcomeScreenPassed: false },
        })
      : { count: 0 },
  ]);

  console.log(`Backfill complete: ${resultTrue.count} set true, ${resultFalse.count} set false (${users.length} total).`);
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
