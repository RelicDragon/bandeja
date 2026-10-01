import assert from 'node:assert/strict';
import { Sport } from '@prisma/client';
import prisma from '../../config/database';
import { runMonthlyRecapPass } from './monthlyRecapPass';
import { generateMonthlyRecap } from './recap.service';
import {
  findLowActivityUserIdsForMonth,
  findUserIdsWithGamesInMonth,
  loadRecapBuildInput,
  loadRecapOwner,
} from './recapInputs.loader';

/**
 * PRD 353 — the recap loader against a real database.
 *
 * `monthlyRecapPass.test.ts` fakes every Prisma call, and Prisma's types accept
 * an unknown key inside a nested `select` (the field just comes back `never`),
 * so neither the unit tests nor `tsc` noticed when the loader kept selecting
 * `User.playStreakCount` after streaks moved to `UserSportProfile` — every
 * user's recap failed at runtime instead. Only running the real queries
 * catches that class of bug.
 *
 * Safe against `padelpulse_dev`: throwaway users, deleted again at the end
 * (sport profiles and recap rows cascade off them).
 */

const MONTH_KEY = '2026-09';

async function main(): Promise<void> {
  const multi = await prisma.user.create({
    data: {
      firstName: 'Recap',
      lastName: 'LoaderMulti',
      language: 'en',
      primarySport: Sport.TENNIS,
      sportProfiles: {
        create: [
          { sport: Sport.PADEL, playStreakCount: 7, playStreakBest: 9 },
          { sport: Sport.TENNIS, playStreakCount: 3, playStreakBest: 5 },
        ],
      },
    },
    select: { id: true },
  });
  const noPrimaryProfile = await prisma.user.create({
    data: {
      firstName: 'Recap',
      lastName: 'LoaderFallback',
      primarySport: Sport.PADEL,
      sportProfiles: { create: [{ sport: Sport.SQUASH, playStreakCount: 2, playStreakBest: 4 }] },
    },
    select: { id: true },
  });
  const noProfiles = await prisma.user.create({
    data: { firstName: 'Recap', lastName: 'LoaderNone' },
    select: { id: true },
  });
  const userIds = [multi.id, noPrimaryProfile.id, noProfiles.id];

  try {
    // The streak comes from the primary sport's profile, not the first or the max.
    const owner = await loadRecapOwner(multi.id);
    assert.ok(owner);
    assert.equal(owner.primarySport, Sport.TENNIS);
    assert.equal(owner.playStreakCount, 3);
    assert.equal(owner.playStreakBest, 5);

    const fallback = await loadRecapOwner(noPrimaryProfile.id);
    assert.equal(fallback?.playStreakCount, 2);
    assert.equal(fallback?.playStreakBest, 4);

    const bare = await loadRecapOwner(noProfiles.id);
    assert.equal(bare?.playStreakCount, 0);
    assert.equal(bare?.playStreakBest, 0);

    assert.equal(await loadRecapOwner('recap-loader-missing-user'), null);

    const input = await loadRecapBuildInput(owner, MONTH_KEY);
    assert.deepEqual(input.games, []);
    assert.deepEqual(input.streak, { weeks: 3, best: 5 });
    assert.equal((await loadRecapBuildInput(bare!, MONTH_KEY)).streak, null);

    // The eligibility scans must at least be valid queries.
    await findUserIdsWithGamesInMonth(MONTH_KEY, { limit: 1 });
    await findLowActivityUserIdsForMonth(MONTH_KEY, { limit: 1 });

    // The production pass, with real loading and generation, fails nobody.
    const notified: string[] = [];
    const stats = await runMonthlyRecapPass(
      {
        findActiveUserIds: async () => ({ userIds, nextCursor: null }),
        findLowActivityUserIds: async () => ({ userIds: [], nextCursor: null }),
        loadOwner: loadRecapOwner,
        generate: generateMonthlyRecap,
        notify: async ({ userId }) => {
          notified.push(userId);
        },
        prune: async () => ({ recapsPruned: 0 }),
      },
      { force: true, monthKey: MONTH_KEY },
    );
    assert.equal(stats.failed, 0);
    assert.equal(stats.created, userIds.length);
    assert.deepEqual(notified, userIds);

    assert.equal(
      await prisma.monthlyRecap.count({ where: { userId: { in: userIds }, monthKey: MONTH_KEY } }),
      userIds.length,
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

main()
  .then(() => console.log('✅ recapInputs integration tests passed'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
