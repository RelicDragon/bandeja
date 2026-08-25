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

import { EntityType, ParticipantRole, type Sport } from '@prisma/client';
import { habitUnlocksDue } from '@bandeja/shared/achievements';
import prisma from '../src/config/database';
import { achievementPlayAt } from '../src/services/achievements/achievementPlayAt';
import {
  computeHabitCrossingDates,
  type HabitCrossingEvent,
} from '../src/services/achievements/habitCrossingDates';
import { computeOrganizeCrossingDates } from '../src/services/achievements/organizeCrossingDates';
import { computePartnerCrossingDates } from '../src/services/achievements/partnerCrossingDates';
import { computeTieBreakCrossingDates } from '../src/services/achievements/tieBreakCrossingDates';
import { countersFromSportProfiles } from '../src/services/achievements/achievementProjection.service';
import {
  backfillHabitAchievementsForUser,
  type HabitGrantTiming,
} from '../src/services/achievements/habitGrant.service';
import { refreshOrganizeHabitCounters } from '../src/services/achievements/organizeGrant.service';
import { refreshPartnerHabitCounters } from '../src/services/achievements/partnerGrant.service';
import { refreshTieBreakHabitCounters } from '../src/services/achievements/tieBreakGrant.service';
import { resolveSportStatsDeltasForReconcile } from '../src/services/results/outcomeStatsSnapshot';
import { countsForPlayStreak } from '../src/services/results/ratingActivity';
import { getUserTimezone } from '../src/services/user-timezone.service';


async function crossingsForDue(params: {
  userId: string;
  dueIds: ReadonlySet<string>;
}): Promise<Map<string, { earnedAt: Date; sourceGameId: string }>> {
  const timezone = await getUserTimezone(params.userId);
  const events = await loadEventsForUser(params.userId);
  const out = computeHabitCrossingDates({
    events,
    timezone,
    definitionIds: params.dueIds,
  });
  const organize = await computeOrganizeCrossingDates({
    userId: params.userId,
    definitionIds: params.dueIds,
  });
  const partner = await computePartnerCrossingDates({
    userId: params.userId,
    definitionIds: params.dueIds,
  });
  const tiebreak = await computeTieBreakCrossingDates({
    userId: params.userId,
    definitionIds: params.dueIds,
  });
  for (const [id, crossing] of organize) out.set(id, crossing);
  for (const [id, crossing] of partner) out.set(id, crossing);
  for (const [id, crossing] of tiebreak) out.set(id, crossing);
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
    byUser.set(userIdFilter, []);
  } else if (!userIdFilter) {
    const [owners, doublesPlayers] = await Promise.all([
      prisma.gameParticipant.findMany({
        where: {
          role: ParticipantRole.OWNER,
          game: { resultsStatus: 'FINAL' },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.teamPlayer.findMany({
        where: {
          team: {
            match: {
              round: {
                game: {
                  sport: 'PADEL',
                  affectsRating: true,
                  resultsStatus: 'FINAL',
                  entityType: {
                    in: [EntityType.GAME, EntityType.TOURNAMENT, EntityType.LEAGUE],
                  },
                },
              },
            },
          },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);
    for (const row of [...owners, ...doublesPlayers]) {
      if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    }
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
    const organize = await refreshOrganizeHabitCounters(userId);
    const partner = await refreshPartnerHabitCounters(userId);
    const tiebreak = await refreshTieBreakHabitCounters(userId);
    const counters = {
      ...countersFromSportProfiles(userProfiles),
      ...organize,
      ...partner,
      ...tiebreak,
    };
    const due = habitUnlocksDue({
      counters,
      ownedDefinitionIds: ownedByUser.get(userId) ?? new Set(),
    });
    if (due.length === 0) continue;

    const dueIds = new Set(due.map((d) => d.id));
    const crossings = await crossingsForDue({ userId, dueIds });

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
    const organize = await refreshOrganizeHabitCounters(plan.userId);
    const partner = await refreshPartnerHabitCounters(plan.userId);
    const tiebreak = await refreshTieBreakHabitCounters(plan.userId);
    const counters = {
      ...countersFromSportProfiles(userProfiles),
      ...organize,
      ...partner,
      ...tiebreak,
    };
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
