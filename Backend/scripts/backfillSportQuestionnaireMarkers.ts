import dotenv from 'dotenv';
dotenv.config();

import { Sport, SportLevelSource } from '@prisma/client';
import prisma from '../src/config/database';
import { getImplementedSports, getSportConfig } from '../src/sport/sportRegistry';
import { MIN_SPORT_LEVEL } from '../src/services/user/userSportProfile.service';

async function backfillSportProfileMarkers(
  sport: Sport,
  questionnaireVersion: string,
  now: Date,
): Promise<{ completed: number; skipped: number }> {
  const profiles = await prisma.userSportProfile.findMany({
    where: {
      sport,
      questionnaireCompletedAt: null,
      questionnaireSkippedAt: null,
      OR: [
        { level: { not: MIN_SPORT_LEVEL } },
        { gamesPlayed: { gt: 0 } },
        { levelSource: SportLevelSource.QUESTIONNAIRE },
      ],
    },
    select: {
      id: true,
      level: true,
      levelSource: true,
      gamesPlayed: true,
    },
  });

  let completed = 0;
  for (const profile of profiles) {
    await prisma.userSportProfile.update({
      where: { id: profile.id },
      data: {
        questionnaireCompletedAt: now,
        questionnaireVersion,
        ...(profile.levelSource === SportLevelSource.DEFAULT && profile.level !== MIN_SPORT_LEVEL
          ? { levelSource: SportLevelSource.QUESTIONNAIRE }
          : {}),
      },
    });
    completed += 1;
  }

  return { completed, skipped: 0 };
}

async function backfillPadelWelcomeLegacy(now: Date): Promise<{ completed: number; skipped: number }> {
  const { PADEL_QUESTIONNAIRE_V1 } = await import('../src/sport/questionnaires/padel');

  const users = await prisma.user.findMany({
    where: {
      welcomeScreenPassed: true,
      sportProfiles: {
        some: {
          sport: Sport.PADEL,
          questionnaireCompletedAt: null,
          questionnaireSkippedAt: null,
        },
      },
    },
    select: {
      sportProfiles: {
        where: { sport: Sport.PADEL },
        select: {
          id: true,
          level: true,
          levelSource: true,
          gamesPlayed: true,
        },
      },
    },
  });

  let completed = 0;
  let skipped = 0;

  for (const user of users) {
    const profile = user.sportProfiles[0];
    if (!profile) continue;

    const treatAsCompleted =
      profile.levelSource === SportLevelSource.QUESTIONNAIRE ||
      profile.level !== MIN_SPORT_LEVEL ||
      profile.gamesPlayed > 0;

    if (treatAsCompleted) {
      await prisma.userSportProfile.update({
        where: { id: profile.id },
        data: {
          questionnaireCompletedAt: now,
          questionnaireVersion: PADEL_QUESTIONNAIRE_V1.id,
          ...(profile.levelSource === SportLevelSource.DEFAULT && profile.level !== MIN_SPORT_LEVEL
            ? { levelSource: SportLevelSource.QUESTIONNAIRE }
            : {}),
        },
      });
      completed += 1;
    } else {
      await prisma.userSportProfile.update({
        where: { id: profile.id },
        data: { questionnaireSkippedAt: now },
      });
      skipped += 1;
    }
  }

  return { completed, skipped };
}

async function backfill() {
  const now = new Date();
  let totalCompleted = 0;
  let totalSkipped = 0;

  for (const sport of getImplementedSports()) {
    const questionnaire = getSportConfig(sport).questionnaire;
    if (!questionnaire) continue;

    const { completed, skipped } = await backfillSportProfileMarkers(sport, questionnaire.id, now);
    if (completed > 0 || skipped > 0) {
      console.log(`${sport}: ${completed} completed markers`);
    }
    totalCompleted += completed;
    totalSkipped += skipped;
  }

  const padelLegacy = await backfillPadelWelcomeLegacy(now);
  totalCompleted += padelLegacy.completed;
  totalSkipped += padelLegacy.skipped;
  if (padelLegacy.completed > 0 || padelLegacy.skipped > 0) {
    console.log(
      `PADEL legacy welcome: ${padelLegacy.completed} completed, ${padelLegacy.skipped} skipped`,
    );
  }

  console.log(
    `Backfill complete: ${totalCompleted} questionnaireCompletedAt, ${totalSkipped} questionnaireSkippedAt.`,
  );
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
