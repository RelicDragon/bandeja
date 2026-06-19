/**
 * Runbook — court.sport & club.sports backfill
 *
 * Dev:
 *   npm run audit:court-club-sports
 *   npm run backfill:court-club-sports -- --apply
 *   npm run audit:court-club-sports
 *
 * Prod:
 *   audit first; operator decides when to --apply. Do not run --apply without review.
 *
 * Rollback:
 *   npm run backfill:court-club-sports -- --rollback scripts/snapshots/court-club-sports/<file>.json
 *
 * Writes only court.sport and club.sports. Idempotent: only fills null court.sport; club sports add-only.
 */
import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';
import {
  applyReconcilePlan,
  computeReconcilePlanFromDb,
  formatReconcileReport,
  loadDbRows,
  loadSnapshot,
  rollbackFromSnapshot,
} from './lib/courtClubSportsReconcile';

function parseArgs(argv: string[]): { apply: boolean; rollbackPath: string | null } {
  const apply = argv.includes('--apply');
  const rollbackIdx = argv.findIndex((a) => a === '--rollback');
  let rollbackPath: string | null = null;
  if (rollbackIdx >= 0) {
    rollbackPath = argv[rollbackIdx + 1] ?? null;
    if (!rollbackPath) {
      throw new Error('Missing path after --rollback');
    }
  }
  if (apply && rollbackPath) {
    throw new Error('Use either --apply or --rollback, not both');
  }
  return { apply, rollbackPath };
}

async function main(): Promise<void> {
  const { apply, rollbackPath } = parseArgs(process.argv.slice(2));

  if (rollbackPath) {
    const snapshot = loadSnapshot(rollbackPath);
    const { courtsRestored, clubsRestored } = await rollbackFromSnapshot(prisma, snapshot);
    console.log(
      `Rollback complete from ${rollbackPath}: courts=${courtsRestored}, clubs=${clubsRestored}`,
    );
    return;
  }

  const plan = await computeReconcilePlanFromDb(prisma);
  const changeCount = plan.courtProposals.length + plan.clubSportsProposals.length;

  if (!apply) {
    console.log(formatReconcileReport(plan));
    console.log('');
    console.log(
      `Dry run: ${changeCount} change(s) would be written ` +
        `(courts=${plan.courtProposals.length}, clubs=${plan.clubSportsProposals.length}). ` +
        'Re-run with --apply to write snapshot and apply.',
    );
    return;
  }

  if (changeCount === 0) {
    console.log('Nothing to apply — plan is already satisfied.');
    return;
  }

  const { courts } = await loadDbRows(prisma);
  const { snapshotPath, courtsUpdated, clubsUpdated } = await applyReconcilePlan(
    prisma,
    plan,
    courts,
  );
  console.log(
    `Applied: courts=${courtsUpdated}, clubs=${clubsUpdated}. Snapshot: ${snapshotPath}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
