/**
 * Recompute UserAchievement.earnedAt for one-shot habit trophies from historical
 * GameOutcome timelines (volume / wins / streak crossings). Fixes rows that
 * inherited "now" from the silent habit backfill.
 *
 *   npx ts-node --transpile-only scripts/backfillHabitAchievementDates.ts
 *   npx ts-node --transpile-only scripts/backfillHabitAchievementDates.ts --apply
 *   npx ts-node --transpile-only scripts/backfillHabitAchievementDates.ts --apply --user <userId>
 */
import dotenv from 'dotenv';
dotenv.config();

import { EntityType, type Sport } from '@prisma/client';
import { getAchievementDefinition } from '@bandeja/shared/achievements';
import prisma from '../src/config/database';
import { achievementPlayAt } from '../src/services/achievements/achievementPlayAt';
import {
  computeHabitCrossingDates,
  type HabitCrossingEvent,
} from '../src/services/achievements/habitCrossingDates';
import { computeOrganizeCrossingDates } from '../src/services/achievements/organizeCrossingDates';
import { computePartnerCrossingDates } from '../src/services/achievements/partnerCrossingDates';
import { resolveSportStatsDeltasForReconcile } from '../src/services/results/outcomeStatsSnapshot';
import { countsForPlayStreak } from '../src/services/results/ratingActivity';
import { getUserTimezone } from '../src/services/user-timezone.service';


async function crossingsForDefinitions(params: {
  userId: string;
  definitionIds: ReadonlySet<string>;
}): Promise<Map<string, { earnedAt: Date; sourceGameId: string }>> {
  const timezone = await getUserTimezone(params.userId);
  const events = await loadEventsForUser(params.userId);
  const out = computeHabitCrossingDates({
    events,
    timezone,
    definitionIds: params.definitionIds,
  });
  const organize = await computeOrganizeCrossingDates({
    userId: params.userId,
    definitionIds: params.definitionIds,
  });
  const partner = await computePartnerCrossingDates({
    userId: params.userId,
    definitionIds: params.definitionIds,
  });
  for (const [id, crossing] of organize) out.set(id, crossing);
  for (const [id, crossing] of partner) out.set(id, crossing);
  return out;
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
      at: achievementPlayAt({ ...row.game, createdAt: row.createdAt }),
      gamesPlayedDelta: deltas.gamesPlayedDelta,
      gamesWonDelta: deltas.gamesWonDelta,
      qualifiesForStreak,
    });
  }
  return events;
}

async function run(apply: boolean, userIdFilter: string | null): Promise<void> {
  const achievements = await prisma.userAchievement.findMany({
    where: {
      isActive: true,
      ...(userIdFilter ? { userId: userIdFilter } : {}),
      definitionId: { startsWith: 'habit_' },
    },
    select: {
      id: true,
      userId: true,
      definitionId: true,
      earnedAt: true,
    },
  });

  const byUser = new Map<string, typeof achievements>();
  for (const row of achievements) {
    if (!getAchievementDefinition(row.definitionId)) continue;
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  let wouldUpdate = 0;
  let unresolved = 0;
  let unchanged = 0;
  let updated = 0;

  for (const [userId, rows] of byUser) {
    const crossings = await crossingsForDefinitions({
      userId,
      definitionIds: new Set(rows.map((r) => r.definitionId)),
    });

    for (const row of rows) {
      const crossing = crossings.get(row.definitionId);
      if (!crossing) {
        unresolved += 1;
        console.log(
          `  unresolved ${userId} ${row.definitionId} (no historical crossing)`,
        );
        continue;
      }
      if (Math.abs(crossing.earnedAt.getTime() - row.earnedAt.getTime()) < 1000) {
        unchanged += 1;
        continue;
      }
      wouldUpdate += 1;
      if (!apply) {
        console.log(
          `  ${userId} ${row.definitionId}: ${row.earnedAt.toISOString()} → ${crossing.earnedAt.toISOString()}`,
        );
        continue;
      }
      await prisma.userAchievement.update({
        where: { id: row.id },
        data: {
          earnedAt: crossing.earnedAt,
          sourceGameId: crossing.sourceGameId,
        },
      });
      updated += 1;
    }
  }

  console.log(
    apply
      ? `Done: updated ${updated}, unchanged ${unchanged}, unresolved ${unresolved}`
      : `Dry run: ${wouldUpdate} would update, ${unchanged} unchanged, ${unresolved} unresolved (pass --apply to write)`,
  );
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
