import dotenv from 'dotenv';
dotenv.config();

import { Sport, SportLevelSource } from '@prisma/client';
import prisma from '../src/config/database';
import { PADEL_QUESTIONNAIRE_V1 } from '../src/sport/questionnaires/padel';
import { MIN_SPORT_LEVEL } from '../src/services/user/userSportProfile.service';

async function userRatingColumnsExist(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'padelpulse'
        AND table_name = 'User'
        AND column_name = 'level'
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

type LegacyUserRow = {
  id: string;
  level: number;
  reliability: number;
  gamesPlayed: number;
  gamesWon: number;
};

/** One-time migration: read legacy `User` columns only; not used at runtime after column drop. */
async function backfillPadelQuestionnaireFromWelcome(): Promise<number> {
  const legacyColumns = await userRatingColumnsExist();
  if (!legacyColumns) {
    console.log('User rating columns already dropped — backfill skipped.');
    return 0;
  }

  const users = await prisma.$queryRaw<LegacyUserRow[]>`
    SELECT
      u.id,
      u.level,
      u.reliability,
      u."gamesPlayed",
      u."gamesWon"
    FROM "User" u
    WHERE u."welcomeScreenPassed" = true
      AND (
        u.level <> ${MIN_SPORT_LEVEL}
        OR u.reliability > 0
        OR u."gamesPlayed" > 0
      )
  `;

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
