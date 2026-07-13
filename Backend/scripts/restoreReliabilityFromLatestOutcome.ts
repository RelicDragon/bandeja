/**
 * Restore UserSportProfile.reliability from latest GameOutcome.reliabilityAfter
 * (idle decay lowered profiles without recording outcomes).
 *
 * Usage:
 *   npx ts-node scripts/restoreReliabilityFromLatestOutcome.ts
 *   npx ts-node scripts/restoreReliabilityFromLatestOutcome.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config();

import type { Sport } from '@prisma/client';
import prisma from '../src/config/database';

const RELIABILITY_EPS = 1e-6;

type DriftRow = {
  userId: string;
  sport: Sport;
  profileReliability: number;
  outcomeReliability: number;
  outcomeId: string;
  gameId: string;
  outcomeAt: Date;
};

async function findDrifts(): Promise<DriftRow[]> {
  return prisma.$queryRaw<DriftRow[]>`
    WITH latest_outcome AS (
      SELECT DISTINCT ON (go."userId", g.sport)
        go."userId",
        g.sport,
        go."reliabilityAfter" AS "outcomeReliability",
        go.id AS "outcomeId",
        go."gameId",
        go."createdAt" AS "outcomeAt"
      FROM "GameOutcome" go
      INNER JOIN "Game" g ON g.id = go."gameId"
      ORDER BY go."userId", g.sport, go."createdAt" DESC
    )
    SELECT
      p."userId",
      p.sport,
      p.reliability AS "profileReliability",
      lo."outcomeReliability",
      lo."outcomeId",
      lo."gameId",
      lo."outcomeAt"
    FROM "UserSportProfile" p
    INNER JOIN latest_outcome lo
      ON lo."userId" = p."userId" AND lo.sport = p.sport
    WHERE ABS(p.reliability - lo."outcomeReliability") > ${RELIABILITY_EPS}
    ORDER BY lo."outcomeAt" DESC
  `;
}

async function applyRestores(rows: DriftRow[]): Promise<number> {
  let updated = 0;
  for (const row of rows) {
    const result = await prisma.userSportProfile.updateMany({
      where: {
        userId: row.userId,
        sport: row.sport,
        reliability: row.profileReliability,
      },
      data: { reliability: row.outcomeReliability },
    });
    if (result.count > 0) updated += 1;
  }
  return updated;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const drifts = await findDrifts();

  console.log(
    apply
      ? `Applying ${drifts.length} reliability restore(s)...`
      : `Dry run: ${drifts.length} reliability drift(s) (pass --apply to write)`,
  );

  for (const row of drifts) {
    console.log(
      [
        row.userId,
        row.sport,
        `${row.profileReliability.toFixed(6)} -> ${row.outcomeReliability.toFixed(6)}`,
        `outcome ${row.outcomeId}`,
        `game ${row.gameId}`,
      ].join(' | '),
    );
  }

  if (!apply) {
    if (drifts.length > 0) console.log('No changes written. Re-run with --apply');
    return;
  }

  const updated = await applyRestores(drifts);
  console.log(`Updated ${updated} profile(s).`);

  const remaining = await findDrifts();
  console.log(`Remaining drifts: ${remaining.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
