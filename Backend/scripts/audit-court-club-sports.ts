/**
 * Runbook — court.sport & club.sports audit (read-only)
 *
 * Dev:
 *   cd Backend && npm run audit:court-club-sports
 *
 * Prod:
 *   Ensure additions/playtomic/jsons/ and jsons-archive/ are on the server, then run audit.
 *   Human decides whether to run backfill --apply (never auto-apply on prod).
 *
 * Workflow: audit → backfill --apply → audit again to confirm zero proposals.
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import {
  computeReconcilePlanFromDb,
  formatReconcileReport,
} from './lib/courtClubSportsReconcile';

async function main(): Promise<void> {
  const plan = await computeReconcilePlanFromDb(prisma);
  console.log(formatReconcileReport(plan));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
