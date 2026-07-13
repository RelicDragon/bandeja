/**
 * Backfill UserSportProfile.lastRatingActivityAt from latest rating-affecting GameOutcome.
 * Does not change ratingUncertainty — idle accrue applies lazily on next rated game / admin view.
 *
 *   npx ts-node scripts/backfillLastRatingActivityAt.ts
 *   npx ts-node scripts/backfillLastRatingActivityAt.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

async function run(apply: boolean): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH latest AS (
      SELECT DISTINCT ON (go."userId", g.sport)
        go."userId",
        g.sport,
        go."createdAt" AS "outcomeAt"
      FROM "GameOutcome" go
      INNER JOIN "Game" g ON g.id = go."gameId"
      WHERE g."affectsRating" = true
      ORDER BY go."userId", g.sport, go."createdAt" DESC
    )
    SELECT COUNT(*)::bigint AS count
    FROM "UserSportProfile" p
    INNER JOIN latest lo ON lo."userId" = p."userId" AND lo.sport = p.sport
    WHERE p."lastRatingActivityAt" IS NULL
  `;
  const pending = Number(rows[0]?.count ?? 0);
  console.log(
    apply
      ? `Updating ${pending} profile(s)...`
      : `Dry run: ${pending} profile(s) need lastRatingActivityAt (pass --apply to write)`,
  );

  if (!apply || pending === 0) return;

  const updated = await prisma.$executeRaw`
    WITH latest AS (
      SELECT DISTINCT ON (go."userId", g.sport)
        go."userId",
        g.sport,
        go."createdAt" AS "outcomeAt"
      FROM "GameOutcome" go
      INNER JOIN "Game" g ON g.id = go."gameId"
      WHERE g."affectsRating" = true
      ORDER BY go."userId", g.sport, go."createdAt" DESC
    )
    UPDATE "UserSportProfile" p
    SET "lastRatingActivityAt" = lo."outcomeAt"
    FROM latest lo
    WHERE lo."userId" = p."userId"
      AND lo.sport = p.sport
      AND p."lastRatingActivityAt" IS NULL
  `;
  console.log(`Updated ${updated} profile(s).`);
}

const apply = process.argv.includes('--apply');
run(apply)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
