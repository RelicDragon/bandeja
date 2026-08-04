/**
 * Mark a league season FINAL and grant podium achievements in one transaction.
 *
 * This is the one-off equivalent of `PUT /api/games/:id { resultsStatus: FINAL }`
 * for a LEAGUE_SEASON, usable from the server/SSH without admin UI auth. It
 * triggers `grantPodiumAchievementsForFinalizedGame` so per-group bracket
 * champions/finalists/third-place trophies are awarded.
 *
 * Only use after the playoff bracket is fully decided. Verify with the
 * fixBracketSlotChampionCache dry-run first so the bracket caches are correct.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/finalizeLeagueSeason.ts \
 *     --league-season-id=<seasonId> [--apply]
 *
 * --apply: write the change (default is a dry run that only reports).
 */
import dotenv from 'dotenv';
dotenv.config();

import { EntityType, ResultsStatus } from '@prisma/client';
import prisma from '../src/config/database';
import {
  grantPodiumAchievementsForFinalizedGame,
  writePodiumUnlocksToGameOutcomes,
} from '../src/services/achievements/podiumGrant.service';
import { isSeasonBracketFullyDecided } from '../src/services/league/leagueSeasonFinalize.service';

const dryRun = !process.argv.includes('--apply');
const seasonArg = process.argv.find((arg) => arg.startsWith('--league-season-id='));
const leagueSeasonId = seasonArg?.slice('--league-season-id='.length).trim();
if (!leagueSeasonId) {
  console.error(
    'Usage: npx ts-node --transpile-only scripts/finalizeLeagueSeason.ts --league-season-id=<id> [--apply]'
  );
  console.error('       (default is a dry run; pass --apply to write changes)');
  process.exit(1);
}

async function main(): Promise<void> {
  const season = await prisma.game.findUnique({
    where: { id: leagueSeasonId },
    select: { id: true, name: true, entityType: true, resultsStatus: true },
  });
  if (!season) {
    console.error(`Season ${leagueSeasonId} not found`);
    process.exit(1);
  }
  console.log(`Season: ${season.name} (${season.id})`);
  console.log(`  entityType:     ${season.entityType}`);
  console.log(`  resultsStatus:  ${season.resultsStatus}`);

  if (season.entityType !== EntityType.LEAGUE_SEASON) {
    console.error(`Refusing: ${season.entityType} is not a LEAGUE_SEASON`);
    process.exit(1);
  }
  if (season.resultsStatus === ResultsStatus.FINAL) {
    console.log('Season is already FINAL — nothing to do.');
    return;
  }

  const decision = await isSeasonBracketFullyDecided(leagueSeasonId);
  console.log(`  bracket:        ${decision.hasBracket ? 'present' : 'none'}`);
  console.log(`  fully decided:  ${decision.fullyDecided}`);
  if (!decision.fullyDecided) {
    console.error(
      'Refusing: bracket is not fully decided (some finals/third-place games are not FINAL).'
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log('\nDRY RUN — would mark FINAL and grant podium. Pass --apply to write.');
    return;
  }

  const batch = await prisma.$transaction(
    async (tx) => {
      await tx.game.update({
        where: { id: leagueSeasonId },
        data: { resultsStatus: ResultsStatus.FINAL, status: 'FINISHED' },
      });
      const podiumBatch = await grantPodiumAchievementsForFinalizedGame({
        gameId: leagueSeasonId,
        tx,
      });
      await writePodiumUnlocksToGameOutcomes({
        db: tx,
        gameId: leagueSeasonId,
        batch: podiumBatch,
      });
      return podiumBatch;
    },
    // Prod over tunnel + multi-group bracket resolution can exceed default 5s.
    { timeout: 60_000, maxWait: 15_000 }
  );

  const grants = batch.grants ?? [];
  console.log(`\nMarked FINAL. Granted ${grants.length} podium achievements:`);
  for (const g of grants) {
    console.log(`  place ${g.place}: user ${g.userId} (${g.achievementId})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
