/**
 * Sync podium trophies for every FINAL podium-eligible event.
 * Idempotent via grantPodiumAchievementsForFinalizedGame.
 *
 *   npx ts-node --transpile-only scripts/backfillPodiumAchievements.ts
 *   npx ts-node --transpile-only scripts/backfillPodiumAchievements.ts --apply
 *   npx ts-node --transpile-only scripts/backfillPodiumAchievements.ts --apply --game <gameId>
 */
import dotenv from 'dotenv';
dotenv.config();

import { EntityType, ResultsStatus } from '@prisma/client';
import {
  isPodiumEligibleEntityType,
  meetsPodiumParticipantFloor,
} from '@bandeja/shared/achievements';
import prisma from '../src/config/database';
import {
  grantPodiumAchievementsForFinalizedGame,
  writePodiumUnlocksToGameOutcomes,
} from '../src/services/achievements/podiumGrant.service';

const PODIUM_IDS = ['podium_gold', 'podium_silver', 'podium_bronze'] as const;

async function run(apply: boolean, gameIdFilter: string | null): Promise<void> {
  const games = await prisma.game.findMany({
    where: {
      resultsStatus: ResultsStatus.FINAL,
      ...(gameIdFilter ? { id: gameIdFilter } : {}),
      OR: [
        { entityType: EntityType.TOURNAMENT },
        { entityType: EntityType.LEAGUE_SEASON },
        { entityType: EntityType.LEAGUE, parentId: null },
      ],
    },
    select: { id: true, entityType: true, parentId: true },
    orderBy: { createdAt: 'asc' },
  });

  const eligible = games.filter((g) =>
    isPodiumEligibleEntityType(g.entityType, g.parentId),
  );

  let needGrant = 0;
  let alreadyHave = 0;
  let belowFloor = 0;

  for (const game of eligible) {
    const [playing, active] = await Promise.all([
      prisma.gameParticipant.count({
        where: { gameId: game.id, status: 'PLAYING' },
      }),
      prisma.userAchievement.count({
        where: {
          sourceKey: game.id,
          isActive: true,
          definitionId: { in: [...PODIUM_IDS] },
        },
      }),
    ]);
    if (!meetsPodiumParticipantFloor(playing)) {
      belowFloor += 1;
      continue;
    }
    if (active === 0) needGrant += 1;
    else alreadyHave += 1;
  }

  console.log(
    `${apply ? 'Applying' : 'Dry run'}: ${eligible.length} eligible FINAL events; ` +
      `${needGrant} with floor & 0 podium rows, ${alreadyHave} already awarded, ` +
      `${belowFloor} below N≥8 floor`,
  );

  if (!apply) {
    console.log('Pass --apply to sync via grantPodiumAchievementsForFinalizedGame');
    return;
  }

  let filled = 0;
  let kept = 0;
  let replaced = 0;
  let empty = 0;
  let grants = 0;

  for (const game of eligible) {
    const before = await prisma.userAchievement.count({
      where: {
        sourceKey: game.id,
        isActive: true,
        definitionId: { in: [...PODIUM_IDS] },
      },
    });
    const batch = await grantPodiumAchievementsForFinalizedGame({ gameId: game.id });
    await writePodiumUnlocksToGameOutcomes({
      db: prisma,
      gameId: game.id,
      batch,
    });
    grants += batch.grants.length;
    if (batch.replaced) replaced += 1;
    else if (before === 0 && batch.grants.length > 0) filled += 1;
    else if (batch.grants.length > 0) kept += 1;
    else empty += 1;
  }

  console.log(
    `Done: filled ${filled}, kept ${kept}, replaced ${replaced}, empty ${empty}; ` +
      `${grants} active podium grant rows`,
  );
}

const apply = process.argv.includes('--apply');
const gameFlagIdx = process.argv.indexOf('--game');
const gameIdFilter =
  gameFlagIdx >= 0 && process.argv[gameFlagIdx + 1]
    ? process.argv[gameFlagIdx + 1]
    : null;

run(apply, gameIdFilter)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
