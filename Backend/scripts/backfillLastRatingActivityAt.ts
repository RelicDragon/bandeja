/**
 * Backfill UserSportProfile.lastRatingActivityAt from latest rating activity outcome:
 * affectsRating games OR TRAINING. Excludes BAR / LEAGUE_SEASON.
 *
 * Updates existing stamps when a newer training/rated outcome exists.
 *
 *   npx ts-node scripts/backfillLastRatingActivityAt.ts
 *   npx ts-node scripts/backfillLastRatingActivityAt.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

const LATEST_ACTIVITY_SQL = `
  SELECT DISTINCT ON (go."userId", g.sport)
    go."userId",
    g.sport,
    go."createdAt" AS "outcomeAt"
  FROM "GameOutcome" go
  INNER JOIN "Game" g ON g.id = go."gameId"
  WHERE g."entityType" NOT IN ('BAR', 'LEAGUE_SEASON')
    AND (g."affectsRating" = true OR g."entityType" = 'TRAINING')
  ORDER BY go."userId", g.sport, go."createdAt" DESC
`;

async function run(apply: boolean): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
    WITH latest AS (${LATEST_ACTIVITY_SQL})
    SELECT COUNT(*)::bigint AS count
    FROM "UserSportProfile" p
    INNER JOIN latest lo ON lo."userId" = p."userId" AND lo.sport = p.sport
    WHERE p."lastRatingActivityAt" IS NULL
       OR p."lastRatingActivityAt" < lo."outcomeAt"
  `);
  const pending = Number(rows[0]?.count ?? 0);
  console.log(
    apply
      ? `Updating ${pending} profile(s)...`
      : `Dry run: ${pending} profile(s) need lastRatingActivityAt sync (pass --apply to write)`,
  );

  if (!apply || pending === 0) return;

  const updated = await prisma.$executeRawUnsafe(`
    WITH latest AS (${LATEST_ACTIVITY_SQL})
    UPDATE "UserSportProfile" p
    SET "lastRatingActivityAt" = lo."outcomeAt"
    FROM latest lo
    WHERE lo."userId" = p."userId"
      AND lo.sport = p.sport
      AND (
        p."lastRatingActivityAt" IS NULL
        OR p."lastRatingActivityAt" < lo."outcomeAt"
      )
  `);
  console.log(`Updated ${updated} profile(s).`);
}

const apply = process.argv.includes('--apply');
run(apply)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
