/**
 * Backfill UserSportProfile play streak fields from qualifying GameOutcome timestamps
 * (ratingStatsApplied / gamesPlayedDelta / legacy affectsRating).
 *
 *   npx ts-node scripts/backfillPlayStreak.ts
 *   npx ts-node scripts/backfillPlayStreak.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config();

import { Sport } from '@prisma/client';
import prisma from '../src/config/database';
import { getUserTimezone } from '../src/services/user-timezone.service';
import { loadQualifyingPlayAts } from '../src/services/results/playStreak.service';
import { recomputePlayStreak } from '../src/services/results/playStreak';

async function run(apply: boolean): Promise<void> {
  const profiles = await prisma.userSportProfile.findMany({
    select: { userId: true, sport: true },
    orderBy: [{ userId: 'asc' }, { sport: 'asc' }],
  });
  console.log(`Profiles: ${profiles.length}`);

  let changed = 0;
  for (const profile of profiles) {
    const timezone = await getUserTimezone(profile.userId);
    const playAts = await loadQualifyingPlayAts(profile.userId, profile.sport as Sport, prisma);
    const state = recomputePlayStreak(playAts, timezone);
    const existing = await prisma.userSportProfile.findUnique({
      where: { userId_sport: { userId: profile.userId, sport: profile.sport } },
      select: {
        playStreakCount: true,
        playStreakBest: true,
        playStreakLastPlayAt: true,
        playStreakWeekStartAt: true,
      },
    });
    if (!existing) continue;
    const same =
      existing.playStreakCount === state.count &&
      existing.playStreakBest === state.best &&
      (existing.playStreakLastPlayAt?.getTime() ?? null) === (state.lastPlayAt?.getTime() ?? null) &&
      (existing.playStreakWeekStartAt?.getTime() ?? null) === (state.weekStartAt?.getTime() ?? null);
    if (same) continue;
    changed += 1;
    if (!apply) continue;
    await prisma.userSportProfile.update({
      where: { userId_sport: { userId: profile.userId, sport: profile.sport } },
      data: {
        playStreakCount: state.count,
        playStreakBest: state.best,
        playStreakLastPlayAt: state.lastPlayAt,
        playStreakWeekStartAt: state.weekStartAt,
      },
    });
  }

  console.log(
    apply
      ? `Updated ${changed} profile(s).`
      : `Dry run: ${changed} profile(s) would change (pass --apply to write)`,
  );
}

const apply = process.argv.includes('--apply');
run(apply)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
