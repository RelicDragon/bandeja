/**
 * Backfill one-shot habit achievements for users whose sport-profile counters
 * already meet catalog thresholds (cabinet progress) but never got a grant
 * (forward-only live grants skip historical crossings).
 *
 * Silent grants — no celebration / results metadata.
 *
 *   npx ts-node --transpile-only scripts/backfillHabitAchievements.ts
 *   npx ts-node --transpile-only scripts/backfillHabitAchievements.ts --apply
 *   npx ts-node --transpile-only scripts/backfillHabitAchievements.ts --apply --user <userId>
 */
import dotenv from 'dotenv';
dotenv.config();

import { habitUnlocksDue } from '@bandeja/shared/achievements';
import prisma from '../src/config/database';
import { countersFromSportProfiles } from '../src/services/achievements/achievementProjection.service';
import { backfillHabitAchievementsForUser } from '../src/services/achievements/habitGrant.service';
async function run(apply: boolean, userIdFilter: string | null): Promise<void> {
  const profiles = await prisma.userSportProfile.findMany({
    where: userIdFilter ? { userId: userIdFilter } : undefined,
    select: {
      userId: true,
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
    // Still check users with zero profiles (nothing to grant).
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

  let usersDue = 0;
  let grantsDue = 0;
  const dueByDefinition = new Map<string, number>();

  for (const [userId, userProfiles] of byUser) {
    const counters = countersFromSportProfiles(userProfiles);
    const due = habitUnlocksDue({
      counters,
      ownedDefinitionIds: ownedByUser.get(userId) ?? new Set(),
    });
    if (due.length === 0) continue;
    usersDue += 1;
    grantsDue += due.length;
    for (const d of due) {
      dueByDefinition.set(d.id, (dueByDefinition.get(d.id) ?? 0) + 1);
    }
  }

  const breakdown = [...dueByDefinition.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `  ${id}: ${n}`)
    .join('\n');

  console.log(
    apply
      ? `Applying habit backfill: ${grantsDue} grant(s) across ${usersDue} user(s)…`
      : `Dry run: ${grantsDue} grant(s) across ${usersDue} user(s) (pass --apply to write)`,
  );
  if (breakdown) console.log(breakdown);
  if (!apply || grantsDue === 0) return;

  let granted = 0;
  let usersTouched = 0;
  for (const [userId, userProfiles] of byUser) {
    const counters = countersFromSportProfiles(userProfiles);
    const result = await backfillHabitAchievementsForUser({ userId, counters });
    if (result.granted.length === 0) continue;
    usersTouched += 1;
    granted += result.granted.length;
    console.log(
      `  ${userId}: +${result.granted.map((d) => d.id).join(', ')}`,
    );
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
