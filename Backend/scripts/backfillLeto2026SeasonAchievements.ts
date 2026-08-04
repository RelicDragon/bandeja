/**
 * Grant exclusive Fix Liga Leto 2026 season medals (best tier only).
 *
 *   npx ts-node --transpile-only scripts/backfillLeto2026SeasonAchievements.ts
 *   npx ts-node --transpile-only scripts/backfillLeto2026SeasonAchievements.ts --apply
 *   npx ts-node --transpile-only scripts/backfillLeto2026SeasonAchievements.ts --apply --user <userId>
 */
import dotenv from 'dotenv';
dotenv.config();

import {
  LETO_2026_SEASON_GAME_ID,
  LETO_2026_TIER_ORDER,
} from '@bandeja/shared/achievements';
import prisma from '../src/config/database';
import { grantLeto2026SeasonAchievements } from '../src/services/achievements/leto2026Grant.service';

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const userFlagIdx = process.argv.indexOf('--user');
  const userIdFilter =
    userFlagIdx >= 0 && process.argv[userFlagIdx + 1]
      ? process.argv[userFlagIdx + 1]
      : null;

  console.log(
    `Leto 2026 season medals (${LETO_2026_SEASON_GAME_ID}) — ${apply ? 'APPLY' : 'dry-run'}`,
  );

  const { planned, granted } = await grantLeto2026SeasonAchievements({
    apply,
    userIdFilter,
  });

  const byDef = new Map<string, number>();
  for (const row of planned) {
    byDef.set(row.definitionId, (byDef.get(row.definitionId) ?? 0) + 1);
  }
  console.log(`Users: ${planned.length}`);
  for (const id of LETO_2026_TIER_ORDER) {
    console.log(`  ${id}: ${byDef.get(id) ?? 0}`);
  }
  if (apply) {
    console.log(`Granted: ${granted}`);
  } else {
    console.log('Pass --apply to write.');
  }
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
