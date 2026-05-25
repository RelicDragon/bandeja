import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import { ResultsStatus, Sport } from '@prisma/client';
import { resolveUserSportSnapshot } from '../src/services/user/userSportProfile.service';
import { USER_SPORT_PROFILE_SELECT } from '../src/utils/constants';

async function backfill() {
  const participantsWithFinalGame = await prisma.gameParticipant.findMany({
    where: { game: { resultsStatus: ResultsStatus.FINAL } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const userIdsWithFinalGame = new Set(participantsWithFinalGame.map((p) => p.userId));

  const users = await prisma.user.findMany({
    select: {
      id: true,
      level: true,
      reliability: true,
      gamesPlayed: true,
      gamesWon: true,
      sportProfiles: {
        where: { sport: Sport.PADEL },
        select: USER_SPORT_PROFILE_SELECT,
      },
    },
  });

  const idsPassedTrue: string[] = [];
  const idsPassedFalse: string[] = [];
  for (const user of users) {
    const padelLevel = resolveUserSportSnapshot(user, Sport.PADEL).level;
    const passed = padelLevel !== 1.0 || userIdsWithFinalGame.has(user.id);
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
