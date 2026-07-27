/**
 * Backfill one-shot habit achievements for users whose sport-profile counters
 * already meet catalog thresholds (cabinet progress) but never got a grant
 * (forward-only live grants skip historical crossings).
 *
 * When possible, earnedAt / sourceGameId come from GameOutcome timeline crossings
 * (e.g. first PADEL game date for habit_first_padel_game).
 *
 * Silent grants — no celebration / results metadata.
 *
 *   npx ts-node --transpile-only scripts/backfillHabitAchievements.ts
 *   npx ts-node --transpile-only scripts/backfillHabitAchievements.ts --apply
 *   npx ts-node --transpile-only scripts/backfillHabitAchievements.ts --apply --user <userId>
 */
import dotenv from 'dotenv';
dotenv.config();

import { EntityType, type Sport } from '@prisma/client';
import { habitUnlocksDue } from '@bandeja/shared/achievements';
import prisma from '../src/config/database';
import {
  computeHabitCrossingDates,
  type HabitCrossingEvent,
} from '../src/services/achievements/habitCrossingDates';
import { countersFromSportProfiles } from '../src/services/achievements/achievementProjection.service';
import {
  backfillHabitAchievementsForUser,
  type HabitGrantTiming,
} from '../src/services/achievements/habitGrant.service';
import { resolveSportStatsDeltasForReconcile } from '../src/services/results/outcomeStatsSnapshot';
import { countsForPlayStreak } from '../src/services/results/ratingActivity';
import { getUserTimezone } from '../src/services/user-timezone.service';

function playAt(game: {
  finishedDate: Date | null;
  endTime: Date | null;
  startTime: Date | null;
  createdAt: Date;
}): Date {
  return game.finishedDate ?? game.endTime ?? game.startTime ?? game.createdAt;
}

async function loadEventsForUser(userId: string): Promise<HabitCrossingEvent[]> {
  const outcomes = await prisma.gameOutcome.findMany({
    where: {
      userId,
      game: {
        entityType: { notIn: [EntityType.BAR, EntityType.LEAGUE_SEASON] },
      },
    },
    select: {
      isWinner: true,
      metadata: true,
      createdAt: true,
      game: {
        select: {
          id: true,
          sport: true,
          affectsRating: true,
          entityType: true,
          finishedDate: true,
          endTime: true,
          startTime: true,
        },
      },
    },
  });

  const events: HabitCrossingEvent[] = [];
  for (const row of outcomes) {
    const deltas = resolveSportStatsDeltasForReconcile(
      row.metadata,
      row.isWinner,
      row.game.affectsRating,
    );
    const qualifiesForStreak =
      countsForPlayStreak(row.game) && deltas.gamesPlayedDelta > 0;
    if (deltas.gamesPlayedDelta <= 0 && deltas.gamesWonDelta <= 0 && !qualifiesForStreak) {
      continue;
    }
    events.push({
      gameId: row.game.id,
      sport: row.game.sport as Sport,
      at: playAt({ ...row.game, createdAt: row.createdAt }),
      gamesPlayedDelta: deltas.gamesPlayedDelta,
      gamesWonDelta: deltas.gamesWonDelta,
      qualifiesForStreak,
    });
  }
  return events;
}

async function run(apply: boolean, userIdFilter: string | null): Promise<void> {
  const profiles = await prisma.userSportProfile.findMany({
    where: userIdFilter ? { userId: userIdFilter } : undefined,
    select: {
      userId: true,
      sport: true,
      gamesPlayed: true,
      gamesWon: true,
      playStreakBest: true,
      playStreakCount: true,
    },
  });

  const byUser = new Map<string, typeof profiles>();
  for (const row of profiles) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  if (userIdFilter && !byUser.has(userIdFilter)) {
    console.log(`No sport profiles for user ${userIdFilter}; nothing to backfill.`);
    return;
  }

  const existing = await prisma.userAchievement.findMany({
    where: userIdFilter ? { userId: userIdFilter } : undefined,
    select: { userId: true, definitionId: true },
  });
  const ownedByUser = new Map<string, Set<string>>();
  for (const row of existing) {
    const set = ownedByUser.get(row.userId) ?? new Set();
    set.add(row.definitionId);
    ownedByUser.set(row.userId, set);
  }

  type DuePlan = {
    userId: string;
    dueIds: string[];
    timing: Map<string, HabitGrantTiming>;
  };
  const plans: DuePlan[] = [];
  const dueByDefinition = new Map<string, number>();
  let timedGrants = 0;
  let untimedGrants = 0;

  for (const [userId, userProfiles] of byUser) {
    const counters = countersFromSportProfiles(userProfiles);
    const due = habitUnlocksDue({
      counters,
      ownedDefinitionIds: ownedByUser.get(userId) ?? new Set(),
    });
    if (due.length === 0) continue;

    const timezone = await getUserTimezone(userId);
    const events = await loadEventsForUser(userId);
    const crossings = computeHabitCrossingDates({
      events,
      timezone,
      definitionIds: new Set(due.map((d) => d.id)),
    });

    const timing = new Map<string, HabitGrantTiming>();
    for (const def of due) {
      dueByDefinition.set(def.id, (dueByDefinition.get(def.id) ?? 0) + 1);
      const crossing = crossings.get(def.id);
      if (crossing) {
        timedGrants += 1;
        timing.set(def.id, {
          earnedAt: crossing.earnedAt,
          sourceGameId: crossing.sourceGameId,
        });
      } else {
        untimedGrants += 1;
      }
    }
    plans.push({
      userId,
      dueIds: due.map((d) => d.id),
      timing,
    });
  }

  const breakdown = [...dueByDefinition.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `  ${id}: ${n}`)
    .join('\n');

  console.log(
    apply
      ? `Applying habit backfill: ${timedGrants + untimedGrants} grant(s) across ${plans.length} user(s)…`
      : `Dry run: ${timedGrants + untimedGrants} grant(s) across ${plans.length} user(s) (pass --apply to write)`,
  );
  console.log(`  with historical date: ${timedGrants}; without: ${untimedGrants}`);
  if (breakdown) console.log(breakdown);
  if (!apply || plans.length === 0) return;

  let granted = 0;
  let usersTouched = 0;
  for (const plan of plans) {
    const userProfiles = byUser.get(plan.userId) ?? [];
    const counters = countersFromSportProfiles(userProfiles);
    const result = await backfillHabitAchievementsForUser({
      userId: plan.userId,
      counters,
      timingByDefinitionId: plan.timing,
    });
    if (result.granted.length === 0) continue;
    usersTouched += 1;
    granted += result.granted.length;
    const bits = result.granted.map((d) => {
      const t = plan.timing.get(d.id);
      return t ? `${d.id}@${t.earnedAt.toISOString().slice(0, 10)}` : d.id;
    });
    console.log(`  ${plan.userId}: +${bits.join(', ')}`);
  }
  console.log(`Done: granted ${granted} achievement(s) for ${usersTouched} user(s).`);
}

const apply = process.argv.includes('--apply');
const userFlagIdx = process.argv.indexOf('--user');
const userIdFilter =
  userFlagIdx >= 0 && process.argv[userFlagIdx + 1]
    ? process.argv[userFlagIdx + 1]
    : null;

run(apply, userIdFilter)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
