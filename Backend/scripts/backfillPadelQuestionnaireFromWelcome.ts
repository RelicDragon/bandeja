import dotenv from 'dotenv';
dotenv.config();

import { Sport, SportLevelSource } from '@prisma/client';
import prisma from '../src/config/database';
import { PADEL_QUESTIONNAIRE_V1 } from '../src/sport/questionnaires/padel';
import { MIN_SPORT_LEVEL } from '../src/services/user/userSportProfile.service';

/** One-time migration: read legacy `User` columns only; not used at runtime. */
async function backfillPadelQuestionnaireFromWelcome(): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      welcomeScreenPassed: true,
      OR: [
        { level: { not: MIN_SPORT_LEVEL } },
        { reliability: { gt: 0 } },
        { gamesPlayed: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      level: true,
      reliability: true,
      gamesPlayed: true,
      gamesWon: true,
    },
  });

  if (users.length === 0) return 0;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const u of users) {
      await tx.userSportProfile.upsert({
        where: { userId_sport: { userId: u.id, sport: Sport.PADEL } },
        create: {
          userId: u.id,
          sport: Sport.PADEL,
          level: u.level,
          reliability: u.reliability,
          gamesPlayed: u.gamesPlayed,
          gamesWon: u.gamesWon,
          levelSource: SportLevelSource.QUESTIONNAIRE,
          questionnaireCompletedAt: now,
          questionnaireVersion: PADEL_QUESTIONNAIRE_V1.id,
        },
        update: {
          level: u.level,
          reliability: u.reliability,
          gamesPlayed: u.gamesPlayed,
          gamesWon: u.gamesWon,
          levelSource: SportLevelSource.QUESTIONNAIRE,
          questionnaireCompletedAt: now,
          questionnaireVersion: PADEL_QUESTIONNAIRE_V1.id,
        },
      });
    }
  });

  return users.length;
}

async function main() {
  const count = await backfillPadelQuestionnaireFromWelcome();
  console.log(`Backfill complete: ${count} padel profile(s) marked questionnaire completed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
